
(() => {
  "use strict";

  const statuses = [
    "Expected", "Received", "Needs Sorting", "Stored",
    "Ready for Pickup", "Out for Delivery", "Delivered",
    "Picked Up", "Returned", "Exception"
  ];

  const locations = [
    "Shipping & Receiving", "Warehouse", "IT Department",
    "HR Office", "Front Office", "Maintenance", "Quality",
    "Production", "Other", "Unknown / Needs Sorting"
  ];

  const packages = [];
  let selectedPackageId = "";
  let activeDetailForm = "";
  let cameraStream = null;
  let cameraFrame = 0;
  let zxingReader = null;
  let zxingControls = null;
  let zxingModulePromise = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function localDateValue(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function makePackageId() {
    const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").toUpperCase()
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`.toUpperCase();
    return `WIL-PKG-${value}`;
  }

  function formatDate(value, options = { year: "numeric", month: "short", day: "numeric" }) {
    if (!value) return "—";
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    }).format(date);
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function navigate(viewName) {
    stopCamera();
    const view = $(`#view-${viewName}`);
    if (!view) return;

    $$(".view").forEach(section => {
      const active = section === view;
      section.classList.toggle("is-visible", active);
      section.hidden = !active;
    });

    $$(".nav-item").forEach(button => {
      const active = button.dataset.view === viewName ||
        (viewName === "detail" && button.dataset.view === "packages");
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    if (viewName === "packages") renderPackages();
    if (viewName === "find") renderSearchResults();
    if (viewName === "dashboard") renderDashboard();
    if (viewName === "detail") renderDetail();
    if (viewName === "scan") $("#scan-value").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addEvent(record, action, detail, employee) {
    record.history.unshift({
      action,
      detail,
      employee: employee || "",
      time: new Date().toISOString()
    });
  }

  function toast(message, kind = "success") {
    const region = $("#toast-region");
    const item = document.createElement("div");
    item.className = `toast ${kind}`;
    item.textContent = message;
    region.append(item);
    window.setTimeout(() => item.remove(), 3600);
  }

  function setMessage(element, message, kind = "") {
    element.textContent = message;
    element.classList.toggle("is-error", kind === "error");
    element.classList.toggle("is-success", kind === "success");
  }

  function locationText(record) {
    return record.locationDetails
      ? `${record.location}, ${record.locationDetails}`
      : record.location || "Unknown / Needs Sorting";
  }

  function statusPill(status) {
    return `<span class="status-pill status-${normalize(status)}">${escapeHtml(status)}</span>`;
  }

  function renderDashboard() {
    const today = localDateValue();
    const active = packages.filter(record => !["Picked Up", "Returned"].includes(record.status));

    const metrics = [
      { label: "Total packages", value: packages.length, caption: "Registered this session", icon: "▤", style: "" },
      { label: "Received today", value: packages.filter(record => record.dateReceived === today).length, caption: "At this facility", icon: "↓", style: "green" },
      { label: "Awaiting pickup", value: packages.filter(record => record.status === "Ready for Pickup").length, caption: "Ready for the recipient", icon: "◷", style: "yellow" },
      { label: "Currently in storage", value: packages.filter(record => ["Stored", "Received"].includes(record.status)).length, caption: "Received and not picked up", icon: "▣", style: "gray" },
      { label: "Delivered", value: packages.filter(record => record.status === "Delivered").length, caption: "Marked delivered", icon: "✓", style: "green" },
      { label: "Unknown location", value: active.filter(record => record.location === "Unknown / Needs Sorting").length, caption: "Needs a location update", icon: "?", style: "yellow" },
      { label: "Needs attention", value: active.filter(record => ["Exception", "Needs Sorting"].includes(record.status) || !record.location).length, caption: "Exceptions or sorting needed", icon: "!", style: "gray" }
    ];

    $("#metric-grid").innerHTML = metrics.map(metric => `
      <article class="metric-card">
        <div class="metric-top">
          <span class="metric-label">${escapeHtml(metric.label)}</span>
          <span class="metric-icon ${metric.style}" aria-hidden="true">${escapeHtml(metric.icon)}</span>
        </div>
        <div class="metric-value">${metric.value}</div>
        <div class="metric-caption">${escapeHtml(metric.caption)}</div>
      </article>
    `).join("");

    const events = packages.flatMap(record => record.history.map(event => ({ ...event, record })))
      .sort((left, right) => new Date(right.time) - new Date(left.time))
      .slice(0, 6);

    const activity = $("#recent-activity");
    if (events.length === 0) {
      activity.innerHTML = `
        <div class="empty-activity">
          <span class="empty-symbol" aria-hidden="true">◷</span>
          <strong>No package activity yet</strong>
          <p>Register a package to see activity here.</p>
        </div>`;
      return;
    }

    activity.innerHTML = events.map(event => `
      <div class="activity-row">
        <span class="activity-marker" aria-hidden="true">${escapeHtml(activityIcon(event.action))}</span>
        <div class="activity-copy">
          <strong>${escapeHtml(event.action)} · ${escapeHtml(event.record.packageId)}</strong>
          <small>${escapeHtml(event.detail || event.record.recipientName)}</small>
        </div>
        <time class="activity-time" datetime="${escapeHtml(event.time)}">${escapeHtml(formatTime(event.time))}</time>
      </div>
    `).join("");
  }

  function activityIcon(action) {
    if (action.includes("Moved")) return "↗";
    if (action.includes("Picked")) return "✓";
    if (action.includes("Status")) return "↻";
    return "+";
  }

  function matches(record, query) {
    if (!query) return true;
    const text = [
      record.packageId, record.carrier, record.trackingNumber,
      record.recipientName, record.recipientEmail, record.department,
      record.facility, record.location, record.locationDetails,
      record.description, record.status
    ].join(" ").toLowerCase();
    return text.includes(query.toLowerCase());
  }

  function filteredPackages(query, status = "") {
    return packages.filter(record => matches(record, query) && (!status || record.status === status))
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  }

  function renderPackages() {
    const input = $("#management-search");
    const filter = $("#status-filter");
    const selectedStatus = filter.value;

    if (filter.options.length === 1) {
      statuses.forEach(status => filter.add(new Option(status, status)));
      filter.value = selectedStatus;
    }

    const records = filteredPackages(input.value.trim(), filter.value);
    $("#management-count").textContent = `${records.length} ${records.length === 1 ? "package" : "packages"}`;

    $("#package-rows").innerHTML = records.map(record => `
      <tr>
        <td>
          <button type="button" class="package-link" data-open-id="${escapeHtml(record.packageId)}">${escapeHtml(record.packageId)}</button>
          <span class="package-secondary">${escapeHtml(record.carrier)}${record.trackingNumber ? ` · ${escapeHtml(record.trackingNumber)}` : ""}</span>
        </td>
        <td class="recipient-cell">${escapeHtml(record.recipientName)}<span class="package-secondary">${escapeHtml(record.department)}</span></td>
        <td class="location-cell">${escapeHtml(record.location || "Unknown / Needs Sorting")}<small>${escapeHtml(record.locationDetails || "No additional details")}</small></td>
        <td>${statusPill(record.status)}</td>
        <td>${escapeHtml(formatDate(record.dateReceived))}</td>
      </tr>
    `).join("");

    $("#management-empty").hidden = records.length > 0;
    $(".table-wrap").hidden = records.length === 0;
  }

  function renderSearchResults() {
    const query = $("#find-search").value.trim();
    const container = $("#find-results");

    if (!query) {
      container.innerHTML = "";
      return;
    }

    const records = filteredPackages(query);

    if (records.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-symbol" aria-hidden="true">⌕</span>
          <strong>No matching packages</strong>
          <p>Check the spelling or try a package ID or tracking number.</p>
        </div>`;
      return;
    }

    container.innerHTML = records.map(record => `
      <article class="result-card">
        <div class="result-top">
          <div>
            <h2>${escapeHtml(record.recipientName)}</h2>
            <p>${escapeHtml(record.packageId)} · ${escapeHtml(record.department)}</p>
          </div>
          ${statusPill(record.status)}
        </div>
        <div class="result-location">
          <strong>Current physical location</strong>
          <span>${escapeHtml(locationText(record))}</span>
        </div>
        <div class="result-footer">
          <small>${escapeHtml(record.carrier)}${record.trackingNumber ? ` · ${escapeHtml(record.trackingNumber)}` : ""}</small>
          <button class="button button-outline" type="button" data-open-id="${escapeHtml(record.packageId)}">View package</button>
        </div>
      </article>
    `).join("");
  }

  function renderDetail() {
    const record = packages.find(item => item.packageId === selectedPackageId);

    if (!record) {
      navigate("packages");
      return;
    }

    const actionForm = activeDetailForm === "move" ? renderMoveForm(record)
      : activeDetailForm === "status" ? renderStatusForm(record)
        : activeDetailForm === "pickup" ? renderPickupForm()
        : "";

    const canPickUp = !["Picked Up", "Returned"].includes(record.status);

    $("#detail-content").innerHTML = `
      <div class="detail-heading">
        <div>
          <p class="eyebrow">PACKAGE DETAILS</p>
          <div class="detail-title-line">
            <h1 id="detail-title">${escapeHtml(record.packageId)}</h1>
            ${statusPill(record.status)}
          </div>
          <p class="detail-subtitle">Registered ${escapeHtml(formatDate(record.dateReceived))} · ${escapeHtml(record.carrier)}</p>
        </div>
      </div>
      <div class="detail-layout">
        <div>
          <section class="panel detail-card">
            <h2>Package information</h2>
            <p>Recipient and shipment details</p>
            <div class="detail-location">
              <small>Current physical location</small>
              <strong>${escapeHtml(record.location || "Unknown / Needs Sorting")}</strong>
              <span>${escapeHtml(record.locationDetails || "No additional directions recorded")}</span>
            </div>
            <div class="detail-fields">
              ${detailField("Recipient", record.recipientName)}
              ${detailField("Email", record.recipientEmail)}
              ${detailField("Department", record.department)}
              ${detailField("Facility", record.facility)}
              ${detailField("Carrier", record.carrier)}
              ${detailField("Tracking number", record.trackingNumber)}
              ${detailField("Description", record.description)}
              ${detailField("Quantity", record.quantity)}
              ${detailField("Received by", record.receivedBy)}
              ${detailField("Additional notes", record.notes)}
            </div>
          </section>
          <section class="panel history-card">
            <h2>Package history</h2>
            <div class="history-list">
              ${record.history.map(event => `
                <div class="history-entry">
                  <span class="history-dot" aria-hidden="true"></span>
                  <div class="history-copy">
                    <strong>${escapeHtml(event.action)}</strong>
                    <p>${escapeHtml(event.detail)}${event.employee ? ` · ${escapeHtml(event.employee)}` : ""} · ${escapeHtml(formatTime(event.time))}</p>
                  </div>
                </div>
              `).join("")}
            </div>
          </section>
        </div>
        <div>
          <section class="panel detail-actions">
            <h2>Package actions</h2>
            <p>Actions are recorded in this session's package history.</p>
            <div class="action-buttons">
              <button class="button button-outline" type="button" data-detail-action="move">Update location</button>
              <button class="button button-outline" type="button" data-detail-action="status">Change status</button>
              ${canPickUp ? `<button class="button button-primary" type="button" data-detail-action="pickup">Mark picked up</button>` : ""}
            </div>
            ${actionForm}
          </section>
        </div>
      </div>
    `;
  }

  function detailField(label, value) {
    return `<div class="detail-field"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || "—")}</strong></div>`;
  }

  function renderMoveForm(record) {
    return `
      <form class="inline-action-form" id="move-form">
        <label>New location
          <select name="location" required>
            <option value="">Select a location</option>
            ${locations.map(location => `<option value="${escapeHtml(location)}" ${record.location === location ? "selected" : ""}>${escapeHtml(location)}</option>`).join("")}
          </select>
        </label>
        <label>Shelf, row, room, desk, or directions
          <input name="locationDetails" maxlength="180" value="${escapeHtml(record.locationDetails)}" placeholder="e.g. Shelf B, Row 3">
        </label>
        <label>Employee responsible
          <input name="employee" maxlength="100" required placeholder="Prototype only">
        </label>
        <label>Notes
          <textarea name="notes" rows="2" maxlength="500"></textarea>
        </label>
        <button class="button button-primary" type="submit">Save location</button>
      </form>`;
  }

  function renderStatusForm() {
    return `
      <form class="inline-action-form" id="status-form">
        <label>New status
          <select name="status" required>
            ${statuses.map(status => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}
          </select>
        </label>
        <label>Employee responsible
          <input name="employee" maxlength="100" required placeholder="Prototype only">
        </label>
        <label>Notes
          <textarea name="notes" rows="2" maxlength="500"></textarea>
        </label>
        <button class="button button-primary" type="submit">Save status</button>
      </form>`;
  }

  function renderPickupForm() {
    return `
      <form class="inline-action-form" id="pickup-form">
        <label>Picked up by
          <input name="employee" maxlength="100" required placeholder="Prototype only">
        </label>
        <label>Notes
          <textarea name="notes" rows="2" maxlength="500"></textarea>
        </label>
        <label class="confirmation-label">
          <span><input name="confirmPickup" type="checkbox" required> Confirm package handoff</span>
        </label>
        <button class="button button-primary" type="submit">Confirm pickup</button>
      </form>`;
  }

  function openPackage(packageId) {
    if (!packages.some(record => record.packageId === packageId)) {
      toast("Package not found. Check the ID and try again.", "error");
      return;
    }
    selectedPackageId = packageId;
    activeDetailForm = "";
    navigate("detail");
  }

  function readForm(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function showScanResult(value) {
    const scanned = value.trim();
    const status = $("#scan-status");

    if (!scanned) {
      setMessage(status, "Enter or scan a package ID.", "error");
      return;
    }

    const match = packages.find(record =>
      record.packageId.toLowerCase() === scanned.toLowerCase() ||
      record.trackingNumber.toLowerCase() === scanned.toLowerCase()
    );

    if (!match) {
      const trackingInput = $("#register-form")?.elements.trackingNumber;

      if (trackingInput && scanned.length >= 6) {
        trackingInput.value = scanned;
        const carrier = detectCarrier(scanned);

        if (carrier && $("#register-form").elements.carrier) {
          $("#register-form").elements.carrier.value = carrier;
        }

        setMessage(status, "Carrier barcode captured. Review the tracking number and complete package registration.", "success");
        navigate("register");
        return;
      }

      setMessage(status, `No package matches "${scanned}".`, "error");
      return;
    }

    setMessage(status, `Package found: ${match.packageId}`, "success");
    openPackage(match.packageId);
  }

  function detectCarrier(value) {
    const code = String(value || "").trim().toUpperCase();

    if (/^1Z[0-9A-Z]{16}$/.test(code)) return "UPS";
    if (/^(96|98|99)\d{18,22}$/.test(code) || /^\d{12,15}$/.test(code)) return "FedEx";
    if (/^\d{20,22}$/.test(code)) return "USPS";

    return "";
  }

  function applyOcrText(text) {
    const form = $("#register-form");
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    const trackingPatterns = [
      /\b1Z[0-9A-Z]{16}\b/i,
      /\b(?:\d{12,15}|\d{20,22})\b/g,
      /\b[A-Z]{2}\d{9}[A-Z]{2}\b/i
    ];

    let tracking = "";

    for (const pattern of trackingPatterns) {
      const match = text.match(pattern);
      if (match) {
        tracking = match[0];
        break;
      }
    }

    if (tracking) {
      form.elements.trackingNumber.value = tracking.toUpperCase();
      const carrier = detectCarrier(tracking);

      if (carrier) form.elements.carrier.value = carrier;
      else if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(tracking)) {
        form.elements.carrier.value = "USPS";
      }
    }

    const carrierLine = lines.find(line =>
      /\b(UPS|FEDEX|FED EX|USPS|UNITED PARCEL SERVICE|DHL)\b/i.test(line)
    );

    if (!form.elements.carrier.value && carrierLine) {
      const carrier = carrierLine.match(/UPS|FEDEX|FED EX|USPS|DHL/i)?.[0]?.toUpperCase().replace("FED EX", "FedEx");
      if (carrier) form.elements.carrier.value = carrier === "FEDEX" ? "FedEx" : carrier;
    }

    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (email && !form.elements.recipientEmail.value) {
      form.elements.recipientEmail.value = email[0].toLowerCase();
    }

    const markerIndex = lines.findIndex(line => /^(SHIP TO|DELIVER TO|TO)\b/i.test(line));

    if (markerIndex >= 0) {
      const candidate = lines.slice(markerIndex + 1, markerIndex + 4).find(line =>
        /[A-Z]{2,}/i.test(line) &&
        !/\d{3,}/.test(line) &&
        !/^(ATTN|PHONE|TEL)/i.test(line)
      );

      if (candidate && !form.elements.recipientName.value) {
        form.elements.recipientName.value = candidate.replace(/^(MR|MRS|MS|ATTN)\.?\s+/i, "");
      }
    }

    const results = $("#ocr-results");
    results.hidden = false;

    const summary = tracking
      ? `Tracking number detected: ${tracking}. ${detectCarrier(tracking) || "Carrier not confidently identified"}. Please verify the form fields.`
      : "Label text was read, but a tracking number was not confidently identified. Please complete the form manually.";

    results.textContent = `${summary}\n\nExtracted label text:\n${text.trim().slice(0, 3500)}`;
  }

  async function readShippingLabel(file) {
    const status = $("#ocr-status");

    if (!file || !file.type.startsWith("image/")) {
      setMessage(status, "Choose an image file of the shipping label.", "error");
      return;
    }

    $("#label-preview").src = URL.createObjectURL(file);
    $("#label-preview-wrap").hidden = false;

    setMessage(status, "Loading the OCR engine… The image is processed in this browser; it is not submitted to the package database.");

    try {
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
          script.onload = resolve;
          script.onerror = () => reject(new Error("Could not load OCR library. Check internet access and try again."));
          document.head.append(script);
        });
      }

      setMessage(status, "Reading label text… Keep this page open.");

      const result = await window.Tesseract.recognize(file, "eng", {
        logger: message => {
          if (message.status === "recognizing text" && message.progress != null) {
            setMessage(status, `Reading label text… ${Math.round(message.progress * 100)}%`);
          }
        }
      });

      applyOcrText(result.data.text || "");
      setMessage(status, "Label scanned. Review the populated fields and correct any mistakes before registering.", "success");
    } catch (error) {
      setMessage(status, error.message || "Could not read this label. Try a clearer, well-lit photo.", "error");
    }
  }

  // async function startCamera() {
  //   const status = $("#scan-status");

  //   if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  //     setMessage(status, "Camera scanning requires a secure connection (HTTPS) and a supported browser. Enter the package ID or use a handheld scanner instead.", "error");
  //     return;
  //   }

  //   if (typeof window.BarcodeDetector !== "function") {
  //     setMessage(status, "This browser does not support built-in barcode scanning. Enter the package ID or use a handheld scanner instead.", "error");
  //     return;
  //   }

  //   try {
  //     barcodeDetector = new window.BarcodeDetector({
  //       formats: ["qr_code", "code_128", "code_39", "upc_a", "upc_e", "ean_13", "ean_8"]
  //     });

  //     cameraStream = await navigator.mediaDevices.getUserMedia({
  //       video: { facingMode: { ideal: "environment" } },
  //       audio: false
  //     });

  //     const video = $("#camera-video");
  //     video.srcObject = cameraStream;
  //     $("#camera-frame").hidden = false;
  //     await video.play();

  //     setMessage(status, "Camera active. Point it at a package barcode or QR label.");
  //     scanVideoFrame();
  //   } catch (error) {
  //     stopCamera();

  //     const explanation = error && error.name === "NotAllowedError"
  //       ? "Camera access was denied. Allow camera access or enter the package ID."
  //       : "Could not start the camera. Enter the package ID or use a handheld scanner instead.";

  //     setMessage(status, explanation, "error");
  //   }
  // }

  // async function scanVideoFrame() {
  //   const video = $("#camera-video");

  //   if (!cameraStream || !barcodeDetector || video.readyState < 2) {
  //     cameraFrame = window.requestAnimationFrame(scanVideoFrame);
  //     return;
  //   }

  //   try {
  //     const results = await barcodeDetector.detect(video);

  //     if (results.length) {
  //       stopCamera();
  //       showScanResult(results[0].rawValue || "");
  //       return;
  //     }
  //   } catch {
  //     setMessage($("#scan-status"), "Could not read the camera image. Try again or enter the package ID.", "error");
  //     stopCamera();
  //     return;
  //   }

  //   cameraFrame = window.requestAnimationFrame(scanVideoFrame);
  // }

  // function stopCamera() {
  //   if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
  //   cameraFrame = 0;

  //   if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());

  //   cameraStream = null;
  //   barcodeDetector = null;

  //   const video = $("#camera-video");
  //   if (video) video.srcObject = null;

  //   const frame = $("#camera-frame");
  //   if (frame) frame.hidden = true;
  // }

async function startCamera() {
  const status = $("#scan-status");

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setMessage(status, "Camera access requires HTTPS or localhost. Please open the deployed HTTPS website.", "error");
    return;
  }

  try {
    setMessage(status, "Loading barcode scanner...");

    if (!zxingModulePromise) {
      zxingModulePromise = import(
        "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm"
      );
    }

    const ZXing = await zxingModulePromise;

    zxingReader = new ZXing.BrowserMultiFormatReader();

    const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();

    if (!devices.length) {
      throw new Error("No camera was found. Check that your webcam is connected.");
    }

    const video = $("#camera-video");
    $("#camera-frame").hidden = false;

    setMessage(status, "Starting camera...");

    zxingControls = await zxingReader.decodeFromVideoDevice(
      devices[0].deviceId,
      video,
      (result, error) => {
        if (result) {
          const scannedValue = result.getText();

          stopCamera();

          showScanResult(scannedValue);
        }
      }
    );

    setMessage(status, "Camera active! Point it at a package barcode.");

  } catch (error) {
    stopCamera();

    console.error("Barcode scanner error:", error);

    setMessage(
      status,
      error.message || "Unable to start barcode scanning. Check camera permissions and try again.",
      "error"
    );
  }
}

function stopCamera() {
  if (zxingControls) {
    zxingControls.stop();
    zxingControls = null;
  }

  if (zxingReader) {
    zxingReader.reset();
    zxingReader = null;
  }

  const video = $("#camera-video");

  if (video) {
    video.pause();
    video.srcObject = null;
  }

  const frame = $("#camera-frame");

  if (frame) {
    frame.hidden = true;
  }
}


  $("#register-form").addEventListener("submit", event => {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const values = readForm(form);

    const record = {
      packageId: makePackageId(),
      carrier: values.carrier,
      trackingNumber: values.trackingNumber.trim(),
      recipientName: values.recipientName.trim(),
      recipientEmail: values.recipientEmail.trim(),
      department: values.department.trim(),
      facility: values.facility.trim(),
      dateReceived: values.dateReceived || localDateValue(),
      receivedBy: values.receivedBy.trim(),
      description: values.description.trim(),
      quantity: Number(values.quantity),
      notes: values.notes.trim(),
      location: values.location,
      locationDetails: values.locationDetails.trim(),
      status: "Received",
      createdAt: new Date().toISOString(),
      history: []
    };

    addEvent(record, "Package Registered", `${record.carrier} package registered`, record.receivedBy);
    addEvent(record, "Package Received", `${locationText(record)}`, record.receivedBy);

    packages.unshift(record);

    form.reset();
    form.elements.quantity.value = "1";
    form.elements.facility.value = "Williamston, SC";
    form.elements.dateReceived.value = localDateValue();

    setMessage($("#register-status"), `Package registered: ${record.packageId}. This record is temporary and will disappear when the page reloads.`, "success");

    renderDashboard();
    toast("Package registered for this session.");

    window.setTimeout(() => openPackage(record.packageId), 450);
  });

  $("#scan-form").addEventListener("submit", event => {
    event.preventDefault();
    showScanResult($("#scan-value").value);
  });

  $("#start-camera").addEventListener("click", startCamera);
  $("#stop-camera").addEventListener("click", stopCamera);
  $("#register-barcode-scan").addEventListener("click", () => navigate("scan"));

  $("#label-photo").addEventListener("change", event => {
    readShippingLabel(event.currentTarget.files?.[0]);
  });

  $("#dashboard-search").addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    $("#find-search").value = event.currentTarget.value;
    renderSearchResults();
    navigate("find");
  });

  $("#find-search").addEventListener("input", renderSearchResults);
  $("#find-submit").addEventListener("click", renderSearchResults);
  $("#management-search").addEventListener("input", renderPackages);
  $("#status-filter").addEventListener("change", renderPackages);

  document.addEventListener("click", event => {
    const navigationButton = event.target.closest("[data-view], [data-navigate]");

    if (navigationButton) {
      navigate(navigationButton.dataset.view || navigationButton.dataset.navigate);
      return;
    }

    const openButton = event.target.closest("[data-open-id]");

    if (openButton) {
      openPackage(openButton.dataset.openId);
      return;
    }

    const actionButton = event.target.closest("[data-detail-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.detailAction;
    const record = packages.find(item => item.packageId === selectedPackageId);
    if (!record) return;

    if (action === "move" || action === "status") {
      activeDetailForm = activeDetailForm === action ? "" : action;
      renderDetail();
      return;
    }

    if (action === "pickup") {
      activeDetailForm = activeDetailForm === "pickup" ? "" : "pickup";
      renderDetail();
    }
  });

  document.addEventListener("submit", event => {
    if (!["move-form", "status-form", "pickup-form"].includes(event.target.id)) return;

    event.preventDefault();

    const record = packages.find(item => item.packageId === selectedPackageId);
    if (!record) return;

    const form = event.target;
    if (!form.reportValidity()) return;

    const values = readForm(form);
    const employee = values.employee.trim();
    const notes = values.notes.trim();

    if (form.id === "move-form") {
      const previousLocation = locationText(record);
      const nextDetails = values.locationDetails.trim();
      const nextLocation = nextDetails ? `${values.location}, ${nextDetails}` : values.location;

      if (previousLocation === nextLocation) {
        toast("Choose a different location or update the location details.", "error");
        return;
      }

      record.location = values.location;
      record.locationDetails = nextDetails;

      addEvent(record, "Package Moved", `${previousLocation} → ${nextLocation}${notes ? ` · ${notes}` : ""}`, employee);
    } else if (form.id === "status-form") {
      const previousStatus = record.status;
      record.status = values.status;

      addEvent(record, "Status Changed", `${previousStatus} → ${record.status}${notes ? ` · ${notes}` : ""}`, employee);
    } else {
      const previousStatus = record.status;
      record.status = "Picked Up";
      record.pickedUpBy = employee;
      record.pickedUpAt = new Date().toISOString();

      addEvent(record, "Package Picked Up", `${previousStatus} → Picked Up${notes ? ` · ${notes}` : ""}`, employee);
    }

    activeDetailForm = "";
    renderDetail();
    renderDashboard();
    toast("Package updated and history recorded.");
  });

  $$(".nav-item").forEach(button => {
    button.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigate(button.dataset.view);
      }
    });
  });

  $("#register-form").elements.dateReceived.value = localDateValue();
  renderDashboard();
})();
