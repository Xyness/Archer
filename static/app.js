const video = document.getElementById("camera-preview");
const hudCanvas = document.getElementById("hud-overlay");
const captureCanvas = document.getElementById("capture-canvas");
const matchContent = document.getElementById("match-content");
const statusBadge = document.getElementById("status-badge");
const statusText = document.getElementById("status-text");

// currentFaces trails targetFaces so boxes glide instead of snapping between responses
let currentFaces = [];
let targetFaces = [];

// The backend downscales anyway, so there's no point uploading full resolution.
const SEND_W = 320;

if (video && hudCanvas && captureCanvas) {
    const hudCtx = hudCanvas.getContext("2d");
    let analyzing = false;

    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" } })
        .then(stream => {
            video.srcObject = stream;
            if (statusBadge) statusBadge.className = "status-badge";
            if (statusText) statusText.textContent = "Camera active";

            video.addEventListener("loadeddata", () => {
                const ratio = video.videoHeight / video.videoWidth;
                captureCanvas.width = SEND_W;
                captureCanvas.height = Math.round(SEND_W * ratio);

                // Let the container follow whatever aspect ratio the camera gave us,
                // otherwise the overlay ends up offset from the picture.
                const section = video.closest(".video-section");
                if (section) section.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;

                resizeHud();
                // The `analyzing` guard means this really runs "as fast as the backend
                // replies" rather than every 10ms.
                setInterval(captureAndAnalyze, 10);
                requestAnimationFrame(drawHud);
            });
        })
        .catch(err => {
            console.error("Camera error:", err);
            if (statusText) statusText.textContent = "Camera denied";
        });

    window.addEventListener("resize", resizeHud);

    function resizeHud() {
        const rect = video.getBoundingClientRect();
        hudCanvas.width = rect.width * devicePixelRatio;
        hudCanvas.height = rect.height * devicePixelRatio;
        hudCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    async function captureAndAnalyze() {
        if (analyzing || video.readyState < 2) return;
        analyzing = true;
        try {
            const ctx = captureCanvas.getContext("2d");
            ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
            const blob = await new Promise(r => captureCanvas.toBlob(r, "image/jpeg", 0.6));
            const form = new FormData();
            form.append("frame", blob, "f.jpg");
            const res = await fetch("/analyze-frame", { method: "POST", body: form });
            const data = await res.json();

            targetFaces = data.faces || [];
            const matches = data.matches || [];

            if (matches.length > 0 && matchContent) {
                matchContent.innerHTML = matches.map(m => {
                    let confidence = 0;
                    if (m.similarity != null) confidence = Math.round(m.similarity * 100);
                    else if (m.distance != null) confidence = Math.round((1 - m.distance) * 100);
                    if (isNaN(confidence)) confidence = 0;
                    return `
                        <div class="match-card">
                            <img class="match-photo" src="/${m.photo_path}" alt="${m.name}">
                            <p class="match-name">${m.name} ${m.surname}</p>
                            <p class="match-detail">${m.date_of_birth}</p>
                            <div class="match-confidence">
                                <div class="confidence-label">
                                    <span>Confidence</span>
                                    <span>${confidence}%</span>
                                </div>
                                <div class="confidence-bar-bg">
                                    <div class="confidence-bar" style="width: ${confidence}%"></div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join("");
            } else if (matchContent) {
                matchContent.innerHTML = `<p class="no-match">Waiting for detection...</p>`;
            }
        } catch (e) {
            console.error("Analyze error:", e);
        } finally {
            analyzing = false;
        }
    }

    function lerp(a, b, t) { return a + (b - a) * t; }

    function drawHud() {
        const rect = video.getBoundingClientRect();
        const W = rect.width;
        const H = rect.height;

        hudCtx.clearRect(0, 0, W, H);

        for (const face of targetFaces) {
            const alpha = 1;

            const padX = face.w * 0.04;
            const padTop = face.h * 0.04;
            const padBot = face.h * 0.04;
            const fx = (face.x - padX) * W;
            const fy = (face.y - padTop) * H;
            const fw = (face.w + padX * 2) * W;
            const fh = (face.h + padTop + padBot) * H;
            const cx = fx + fw / 2;
            const cy = fy + fh / 2;

            const color = face.known ? `rgba(0, 240, 255, ${alpha})` : `rgba(255, 59, 48, ${alpha})`;
            const colorDim = face.known ? `rgba(0, 240, 255, ${alpha * 0.3})` : `rgba(255, 59, 48, ${alpha * 0.3})`;
            const colorGlow = face.known ? `rgba(0, 240, 255, ${alpha * 0.08})` : `rgba(255, 59, 48, ${alpha * 0.08})`;

            hudCtx.fillStyle = colorGlow;
            hudCtx.fillRect(fx, fy, fw, fh);

            const cornerLen = Math.min(fw, fh) * 0.22;
            hudCtx.strokeStyle = color;
            hudCtx.lineWidth = 2;
            hudCtx.shadowColor = color;
            hudCtx.shadowBlur = 10;

            hudCtx.beginPath();
            hudCtx.moveTo(fx, fy + cornerLen); hudCtx.lineTo(fx, fy); hudCtx.lineTo(fx + cornerLen, fy);
            hudCtx.stroke();
            hudCtx.beginPath();
            hudCtx.moveTo(fx + fw - cornerLen, fy); hudCtx.lineTo(fx + fw, fy); hudCtx.lineTo(fx + fw, fy + cornerLen);
            hudCtx.stroke();
            hudCtx.beginPath();
            hudCtx.moveTo(fx + fw, fy + fh - cornerLen); hudCtx.lineTo(fx + fw, fy + fh); hudCtx.lineTo(fx + fw - cornerLen, fy + fh);
            hudCtx.stroke();
            hudCtx.beginPath();
            hudCtx.moveTo(fx + cornerLen, fy + fh); hudCtx.lineTo(fx, fy + fh); hudCtx.lineTo(fx, fy + fh - cornerLen);
            hudCtx.stroke();

            hudCtx.shadowBlur = 0;

            hudCtx.strokeStyle = colorDim;
            hudCtx.lineWidth = 1;
            hudCtx.setLineDash([4, 6]);
            hudCtx.beginPath();
            hudCtx.moveTo(fx + cornerLen, fy); hudCtx.lineTo(fx + fw - cornerLen, fy);
            hudCtx.moveTo(fx + cornerLen, fy + fh); hudCtx.lineTo(fx + fw - cornerLen, fy + fh);
            hudCtx.moveTo(fx, fy + cornerLen); hudCtx.lineTo(fx, fy + fh - cornerLen);
            hudCtx.moveTo(fx + fw, fy + cornerLen); hudCtx.lineTo(fx + fw, fy + fh - cornerLen);
            hudCtx.stroke();
            hudCtx.setLineDash([]);

            const ch = 5;
            hudCtx.strokeStyle = color;
            hudCtx.lineWidth = 1;
            hudCtx.beginPath();
            hudCtx.moveTo(cx - ch, cy); hudCtx.lineTo(cx + ch, cy);
            hudCtx.moveTo(cx, cy - ch); hudCtx.lineTo(cx, cy + ch);
            hudCtx.stroke();

            const fontSize = Math.max(12, Math.min(15, fw * 0.07));
            hudCtx.font = `600 ${fontSize}px 'Inter', sans-serif`;
            const labelText = face.known && face.confidence ? `${face.label}  ${face.confidence}%` : face.label;
            const textW = hudCtx.measureText(labelText).width;
            const pad = 7;
            const lh = fontSize + pad * 2;
            const lx = fx;
            const ly = fy - lh - 6;

            hudCtx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.55})`;
            roundRect(hudCtx, lx, ly, textW + pad * 2, lh, 4);
            hudCtx.fill();

            hudCtx.fillStyle = color;
            hudCtx.fillText(labelText, lx + pad, ly + fontSize + pad - 2);
        }

        requestAnimationFrame(drawHud);
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}

// Registration form
const personForm = document.getElementById("person-form");
const formMessage = document.getElementById("form-message");

if (personForm) {
    personForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = personForm.querySelector('button[type="submit"]');
        btn.textContent = "Submitting...";
        btn.disabled = true;
        formMessage.textContent = "";
        formMessage.className = "";

        const formData = new FormData(personForm);

        try {
            const res = await fetch("/persons", { method: "POST", body: formData });
            const data = await res.json();
            if (res.ok) {
                formMessage.textContent = data.message;
                formMessage.className = "success";
                personForm.reset();
                loadPersons();
            } else {
                formMessage.textContent = data.detail || "Registration failed.";
                formMessage.className = "error";
            }
        } catch (e) {
            formMessage.textContent = "Network error.";
            formMessage.className = "error";
        } finally {
            btn.textContent = "Register";
            btn.disabled = false;
        }
    });
}

// Persons table: search + pagination
const personsTbody = document.getElementById("persons-tbody");
const emptyState = document.getElementById("empty-state");
const personsTable = document.getElementById("persons-table");
const searchInput = document.getElementById("search-input");
const paginationEl = document.getElementById("pagination");

const PER_PAGE = 10;
let currentPage = 1;
let searchQuery = "";
let searchTimer = null;

if (searchInput) {
    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchQuery = searchInput.value;
            currentPage = 1;
            loadPersons();
        }, 250);
    });
}

async function loadPersons() {
    if (!personsTbody) return;
    try {
        const params = new URLSearchParams({ q: searchQuery, page: currentPage, per_page: PER_PAGE });
        const res = await fetch(`/persons?${params}`);
        const data = await res.json();
        const persons = data.items;
        const total = data.total;
        const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

        if (persons.length === 0) {
            personsTable.style.display = "none";
            emptyState.style.display = "block";
            emptyState.textContent = searchQuery ? "No results" : "No registered persons";
            paginationEl.innerHTML = "";
            return;
        }

        personsTable.style.display = "table";
        emptyState.style.display = "none";

        personsTbody.innerHTML = persons.map(p => `
            <tr class="person-row" data-id="${p.id}">
                <td><img class="thumbnail" src="/${p.photo_path}" alt="${p.name}"></td>
                <td>${p.name}</td>
                <td>${p.surname}</td>
                <td>${p.date_of_birth}</td>
                <td><button class="btn-delete" onclick="event.stopPropagation(); deletePerson(${p.id})">Delete</button></td>
            </tr>
        `).join("");

        personsTbody.querySelectorAll(".person-row").forEach(row => {
            row.addEventListener("click", () => {
                const id = parseInt(row.dataset.id);
                const p = persons.find(x => x.id === id);
                if (p) openProfile(p);
            });
        });

        renderPagination(totalPages);
    } catch (e) {
        console.error("Load error:", e);
    }
}

function renderPagination(totalPages) {
    if (!paginationEl || totalPages <= 1) {
        if (paginationEl) paginationEl.innerHTML = "";
        return;
    }

    let html = "";
    html += `<button class="pg-btn" ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}">&lsaquo;</button>`;

    const range = [1];
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) range.push(i);
    if (totalPages > 1) range.push(totalPages);

    const unique = [...new Set(range)].sort((a, b) => a - b);
    let prev = 0;
    for (const p of unique) {
        if (prev && p - prev > 1) html += `<span class="pg-dots">...</span>`;
        html += `<button class="pg-btn ${p === currentPage ? "pg-active" : ""}" data-page="${p}">${p}</button>`;
        prev = p;
    }

    html += `<button class="pg-btn" ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}">&rsaquo;</button>`;
    paginationEl.innerHTML = html;

    paginationEl.querySelectorAll(".pg-btn:not([disabled])").forEach(btn => {
        btn.addEventListener("click", () => {
            currentPage = parseInt(btn.dataset.page);
            loadPersons();
        });
    });
}

async function deletePerson(id) {
    if (!confirm("Delete this person?")) return;
    try {
        const res = await fetch(`/persons/${id}`, { method: "DELETE" });
        if (res.ok) loadPersons();
    } catch (e) {
        console.error("Delete error:", e);
    }
}

// Profile modal
const profileOverlay = document.getElementById("profile-overlay");
const profileBody = document.getElementById("profile-body");
const profileClose = document.getElementById("profile-close");

async function openProfile(p) {
    if (!profileOverlay) return;
    const created = p.created_at ? new Date(p.created_at).toLocaleDateString("en-US") : "\u2014";

    profileBody.innerHTML = `
        <h2 class="profile-name">${p.name} ${p.surname}</h2>
        <div class="photo-gallery" id="profile-gallery">
            <p class="no-match">Loading photos...</p>
        </div>
        <label class="btn-add-photo" id="btn-add-photo">
            Add a photo
            <input type="file" accept="image/*" style="display:none" id="add-photo-input">
        </label>
        <div class="profile-fields">
            <div class="profile-field">
                <span class="profile-label">Date of birth</span>
                <span class="profile-value">${p.date_of_birth}</span>
            </div>
            <div class="profile-field">
                <span class="profile-label">Registered on</span>
                <span class="profile-value">${created}</span>
            </div>
        </div>
        <button class="btn-delete profile-delete" onclick="deletePerson(${p.id}); closeProfile();">Delete this person</button>
    `;
    profileOverlay.style.display = "flex";

    // Load photos
    await loadProfilePhotos(p.id);

    // Add photo handler
    const addInput = document.getElementById("add-photo-input");
    if (addInput) {
        addInput.addEventListener("change", async () => {
            if (!addInput.files.length) return;
            const form = new FormData();
            form.append("photo", addInput.files[0]);
            try {
                const res = await fetch(`/persons/${p.id}/photos`, { method: "POST", body: form });
                const data = await res.json();
                if (res.ok) {
                    await loadProfilePhotos(p.id);
                    loadPersons();
                } else {
                    alert(data.detail || "Failed to add photo.");
                }
            } catch (e) {
                alert("Network error.");
            }
            addInput.value = "";
        });
    }
}

async function loadProfilePhotos(personId) {
    const gallery = document.getElementById("profile-gallery");
    if (!gallery) return;
    try {
        const res = await fetch(`/persons/${personId}/photos`);
        const data = await res.json();
        const photos = data.photos || [];
        if (photos.length === 0) {
            gallery.innerHTML = `<p class="no-match">No photos</p>`;
            return;
        }
        gallery.innerHTML = photos.map(ph => `
            <div class="gallery-item">
                <img src="/${ph.photo_path}" alt="Photo">
                ${photos.length > 1 ? `<button class="gallery-delete" onclick="event.stopPropagation(); deletePhoto(${personId}, ${ph.id})">&#10005;</button>` : ""}
            </div>
        `).join("");
    } catch (e) {
        gallery.innerHTML = `<p class="no-match">Loading error</p>`;
    }
}

async function deletePhoto(personId, photoId) {
    if (!confirm("Delete this photo?")) return;
    try {
        const res = await fetch(`/persons/${personId}/photos/${photoId}`, { method: "DELETE" });
        if (res.ok) {
            await loadProfilePhotos(personId);
            loadPersons();
        }
    } catch (e) {
        console.error("Delete photo error:", e);
    }
}

function closeProfile() {
    if (profileOverlay) profileOverlay.style.display = "none";
}

if (profileClose) profileClose.addEventListener("click", closeProfile);
if (profileOverlay) profileOverlay.addEventListener("click", (e) => {
    if (e.target === profileOverlay) closeProfile();
});

if (personsTbody) loadPersons();
