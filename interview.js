/* ==========================================================================
   INTERVIEWER PAGE — ເບິ່ງໃບສະໝັກຢ່າງດຽວ (read-only)
   ໜ້ານີ້ບໍ່ມີຄຳສັ່ງ update/delete ໃດໆ ແລະ Firestore rules ກໍ່ບລັອກໄວ້ອີກຊັ້ນ
   (ບັນຊີທີ່ມີ staff/{uid}.role == "interviewer" ຈະຂຽນຫຍັງບໍ່ໄດ້ເລີຍ)
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, query, orderBy, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  firebaseConfig, APPLICATIONS_COLLECTION
} from "./firebase-config.js";

window.__interviewLoaded = true;   // ບອກໜ້າ HTML ວ່າໄຟລ໌ນີ້ເຮັດວຽກແລ້ວ

const STAFF_COLLECTION = "staff";
const SETTINGS_COLLECTION = "settings";
const EVALUATIONS_COLLECTION = "evaluations";

/* ຫົວຂໍ້ໃຫ້ຄະແນນເລີ່ມຕົ້ນ — ປ່ຽນໄດ້ຈາກໜ້າ admin → ແທັບ "ຕັ້ງຄ່າ" */
const DEFAULT_CRITERIA = [
  { id: "c1", label_la: "ບຸກຄະລິກກະພາບ ແລະ ການສື່ສານ", label_en: "Personality & communication" },
  { id: "c2", label_la: "ຄວາມຮູ້ ແລະ ທັກສະໃນສາຍງານ",   label_en: "Knowledge & job skills" },
  { id: "c3", label_la: "ປະສົບການເຮັດວຽກ",              label_en: "Work experience" },
  { id: "c4", label_la: "ທັດສະນະຄະຕິ ແລະ ຄວາມກະຕືລືລົ້ນ", label_en: "Attitude & motivation" },
  { id: "c5", label_la: "ຄວາມເໝາະສົມກັບອົງກອນ",         label_en: "Fit with the organisation" }
];

/* ຮູບແບບການໃຫ້ຄະແນນ — ເລືອກໄດ້ຈາກໜ້າ admin → ແທັບ "ຕັ້ງຄ່າ" */
const SCALES = {
  rank5: { max: 5, options: [0, 1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) })) },
  pass3: { max: 2, options: [
    { value: 0, label: "ບໍ່ຜ່ານ",   cls: "is-fail" },
    { value: 1, label: "ພິຈາລະນາ", cls: "is-maybe" },
    { value: 2, label: "ຜ່ານ",     cls: "is-pass" }
  ] }
};
let SCALE = SCALES.rank5;

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const FIREBASE_NOT_CONFIGURED = firebaseConfig.apiKey === "YOUR_API_KEY";

document.getElementById("year").textContent = new Date().getFullYear();

const $ = id => document.getElementById(id);

/* ດັກຂໍ້ຜິດພາດທຸກຢ່າງ ແລ້ວສະແດງໃຫ້ເຫັນເທິງໜ້າຈໍ ແທນທີ່ຈະເປັນຈໍຂາວ */
function showFatal(msg){
  const box = document.getElementById("fatal-error");
  if(!box) return;
  box.style.display = "block";
  box.textContent = "ເກີດຂໍ້ຜິດພາດໃນໜ້ານີ້:\n" + msg;
}
window.addEventListener("error", e => showFatal(e.message + "\n" + (e.filename || "") + ":" + (e.lineno || "")));
window.addEventListener("unhandledrejection", e => showFatal("Promise: " + (e.reason?.message || e.reason)));
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}
function setStatus(el, msg, kind = ""){
  el.textContent = msg;
  el.className = "form-status" + (kind ? " " + kind : "");
}

/* ==========================================================================
   AUTH
   ========================================================================== */
const loginView = $("login-view");
const viewerView = $("viewer-view");
const logoutBtn = $("logout-btn");

if(FIREBASE_NOT_CONFIGURED){
  loginView.hidden = false;
  setStatus($("login-status"), "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Firebase — ແກ້ໄຂ firebase-config.js ກ່ອນ (ເບິ່ງ README.md)", "err");
}

onAuthStateChanged(auth, async user => {
  if(FIREBASE_NOT_CONFIGURED) return;
  try {
  if(user){
    /* ອ່ານບົດບາດ — ບໍ່ມີ staff doc = ບໍ່ໄດ້ລົງທະບຽນ ບໍ່ໃຫ້ເຂົ້າ */
    let role = null;
    try {
      const snap = await getDoc(doc(db, STAFF_COLLECTION, user.uid));
      if(snap.exists() && snap.data().role) role = snap.data().role;
    } catch (err){ console.warn("ອ່ານບົດບາດບໍ່ໄດ້:", err); }
    if(!role){
      await rejectUnregistered(user);
      return;
    }

    loginView.hidden = true;
    viewerView.hidden = false;
    logoutBtn.hidden = false;
    $("viewer-email").textContent = user.email || "(ບໍ່ຮູ້ອີເມວ)";
    $("viewer-role").textContent = role === "admin" ? "ຜູ້ດູແລລະບົບ" : "ຜູ້ສຳພາດ (ອ່ານຢ່າງດຽວ)";

    ME = { uid: user.uid, email: user.email || "", name: "" };
    /* ຊື່ທີ່ຈະສະແດງ: ເອົາຈາກ staff doc ກ່ອນ → ຈາກທີ່ເຄີຍພິມໄວ້ → ສຸດທ້າຍໃຊ້ອີເມວ */
    try {
      const st = await getDoc(doc(db, STAFF_COLLECTION, user.uid));
      if(st.exists() && st.data().name) ME.name = st.data().name;
    } catch (err){ /* ອ່ານບໍ່ໄດ້ກໍ່ຂ້າມ */ }
    if(!ME.name) ME.name = localStorage.getItem("ssmi-my-name") || "";
    $("my-name").value = ME.name;
    await loadCriteria();
    await loadApplications();
  } else {
    stopApplications();
    loginView.hidden = false;
    viewerView.hidden = true;
    logoutBtn.hidden = true;
  }
  } catch (err){
    console.error(err);
    showFatal(err.message);
    loginView.hidden = false;
  }
}, err => {
  console.error(err);
  showFatal("Auth: " + err.message);
  loginView.hidden = false;
});

$("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  if(FIREBASE_NOT_CONFIGURED) return;
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if(!email || !password){
    setStatus($("login-status"), "ກະລຸນາປ້ອນອີເມວ ແລະ ລະຫັດຜ່ານ", "err");
    return;
  }
  $("login-submit").disabled = true;
  setStatus($("login-status"), "ກຳລັງເຂົ້າສູ່ລະບົບ...");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    setStatus($("login-status"), "");
  } catch (err){
    console.error(err);
    setStatus($("login-status"), "ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ: " + err.code, "err");
  } finally {
    $("login-submit").disabled = false;
  }
});

/* ບັນຊີທີ່ບໍ່ໄດ້ລົງທະບຽນໃນ staff — ອອກຈາກລະບົບ
   ຖ້າເປັນບັນຊີ Google ທີ່ຫາກໍ່ຖືກສ້າງຂຶ້ນຕອນກົດລ໋ອກອິນ ໃຫ້ລຶບທິ້ງເລີຍ ບໍ່ໃຫ້ຄ້າງໃນ Firebase Auth */
async function rejectUnregistered(user){
  const email = user.email || "";
  const isNewGoogle = user.providerData.length === 1
    && user.providerData[0].providerId === "google.com"
    && user.metadata.creationTime === user.metadata.lastSignInTime;
  try {
    if(isNewGoogle) await user.delete();
    else await signOut(auth);
  } catch (err){
    console.warn(err);
    await signOut(auth).catch(() => {});
  }
  loginView.hidden = false;
  viewerView.hidden = true;
  logoutBtn.hidden = true;
  setStatus($("login-status"),
    `ບັນຊີ ${email} ຍັງບໍ່ໄດ້ຮັບສິດເຂົ້າລະບົບ — ກະລຸນາຕິດຕໍ່ພະແນກໄອທີ`, "err");
}

/* ລ໋ອກອິນດ້ວຍ Google — ກວດສິດຕໍ່ໃນ onAuthStateChanged */
$("google-login-btn").addEventListener("click", async () => {
  if(FIREBASE_NOT_CONFIGURED) return;
  const btn = $("google-login-btn");
  btn.disabled = true;
  setStatus($("login-status"), "ກຳລັງເຂົ້າສູ່ລະບົບດ້ວຍ Google...");
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (err){
    console.error(err);
    if(err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request"){
      setStatus($("login-status"), "");
      return;
    }
    const msg = {
      "auth/popup-blocked": "Browser ບລັອກໜ້າຕ່າງ popup — ກະລຸນາອະນຸຍາດ popup ແລ້ວລອງໃໝ່",
      "auth/account-exists-with-different-credential": "ອີເມວນີ້ມີບັນຊີແບບລະຫັດຜ່ານຢູ່ແລ້ວ — ກະລຸນາເຂົ້າດ້ວຍອີເມວ ແລະ ລະຫັດຜ່ານ",
      "auth/unauthorized-domain": "ໂດເມນນີ້ຍັງບໍ່ໄດ້ຮັບອະນຸຍາດໃນ Firebase → Authentication → Settings → Authorized domains",
      "auth/operation-not-allowed": "ຍັງບໍ່ໄດ້ເປີດໃຊ້ Google ໃນ Firebase Console → Authentication"
    }[err.code] || "ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ: " + err.code;
    setStatus($("login-status"), msg, "err");
  } finally {
    btn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

/* ==========================================================================
   APPLICATIONS (read-only)
   ========================================================================== */
const STATUS_OPTIONS = [
  { value: "new",         label: "ໃໝ່" },
  { value: "reviewing",   label: "ກຳລັງພິຈາລະນາ" },
  { value: "interviewed", label: "ສຳພາດແລ້ວ" },
  { value: "accepted",    label: "ຮັບເຂົ້າເຮັດວຽກ" },
  { value: "rejected",    label: "ບໍ່ຜ່ານ" }
];

let applications = [];
let ME = { uid: "", email: "" };
let criteria = [];
let evaluations = [];        // ທຸກໃບປະເມີນຂອງທຸກຜູ້ສຳພາດ
const NO_BRANCH = "__none__";
const appFilters = { branch: "", dept: "", position: "", status: "", q: "" };

function appBranchKey(a){ return (a.branch || "").trim() || NO_BRANCH; }
function appBranchLabel(a){ return (a.branch || "").trim() || "ບໍ່ໄດ້ລະບຸສາຂາ"; }

/* ໃບສະໝັກແບບ Realtime — admin ປ່ຽນລຳດັບສຳພາດ / ສະຖານະ ຫຼື ມີໃບສະໝັກໃໝ່
   ໜ້ານີ້ຈະອັບເດດເອງທັນທີ ໂດຍບໍ່ລ້າງຄະແນນທີ່ກຳລັງກອກຢູ່ */
let appsUnsub = null;
const cardCache = new Map();   // docId -> <div class="app-card"> (ເກັບໄວ້ເພື່ອຮັກສາສິ່ງທີ່ກຳລັງກອກ)

function loadApplications(){
  if(appsUnsub) return Promise.resolve();
  const listEl = $("apps-list");
  listEl.innerHTML = `<p class="admin-loading">ກຳລັງໂຫຼດໃບສະໝັກ...</p>`;
  return new Promise(resolve => {
    let first = true;
    appsUnsub = onSnapshot(
      query(collection(db, APPLICATIONS_COLLECTION), orderBy("submittedAt", "desc")),
      async snap => {
        applications = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        const initial = first;
        if(first){ first = false; await loadEvaluations(); }
        renderFilterOptions();
        renderApplications({ flashMoves: !initial });
        renderScoreboard();
        resolve();
      },
      err => {
        console.error(err);
        listEl.innerHTML = `<p class="admin-error">ໂຫຼດໃບສະໝັກບໍ່ສຳເລັດ: ${escapeHtml(err.message)}</p>`;
        appsUnsub = null;
        resolve();
      });
  });
}

function stopApplications(){
  if(appsUnsub){ appsUnsub(); appsUnsub = null; }
  cardCache.clear();
  applications = [];
}

/* ລຳດັບສຳພາດ (interviewOrder) ທີ່ admin ຕັ້ງ — ຕົວເລກນ້ອຍ = ສຳພາດກ່ອນ
   ຄົນທີ່ຍັງບໍ່ໄດ້ຈັດຄິວ ຈະຢູ່ທ້າຍ (ລ່າສຸດກ່ອນ) */
const queueNo = a => (Number.isFinite(a.interviewOrder) && a.interviewOrder > 0) ? a.interviewOrder : null;
const submittedMs = a => a.submittedAt?.toMillis?.() || 0;
function byQueue(x, y){
  const qx = queueNo(x), qy = queueNo(y);
  if(qx !== null && qy !== null) return (qx - qy) || (submittedMs(x) - submittedMs(y));
  if(qx !== null) return -1;
  if(qy !== null) return 1;
  return submittedMs(y) - submittedMs(x);
}
const queueBadgeHtml = a => queueNo(a) !== null ? `<span class="queue-badge">ຄິວທີ ${queueNo(a)}</span>` : "";

/* ສະຖານະທີ່ຖືວ່າ "ສຳພາດແລ້ວ" — admin ກົດໃນແທັບ "ລຳດັບສຳພາດ" */
const QUEUE_DONE = new Set(["interviewed", "accepted", "rejected"]);
const isQueueDone = a => QUEUE_DONE.has(a.status);

/* ຄິວທັງໝົດ / ຄົນທີ່ກຳລັງສຳພາດ (ຄິວທຳອິດທີ່ຍັງບໍ່ສຳພາດ) / ຄົນຖັດໄປ */
function queueState(){
  const queued = applications.filter(a => queueNo(a) !== null).sort(byQueue);
  const pending = queued.filter(a => !isQueueDone(a));
  return { queued, current: pending[0] || null, next: pending[1] || null,
           doneCount: queued.length - pending.length };
}

/* ໃສ່ class ໃຫ້ບັດ: ກຳລັງສຳພາດ (ໄຮໄລທ໌) / ສຳພາດແລ້ວ (ຈາງລົງ) */
function applyQueueState(card, a, currentId){
  const inQueue = queueNo(a) !== null;
  card.classList.toggle("is-current", a.docId === currentId);
  card.classList.toggle("is-done", inQueue && isQueueDone(a));
}

/* ປ້າຍເທິງລາຍການ: "ຕອນນີ້ຮອດຄິວ ... · ຖັດໄປ ..." */
function renderQueueNow(){
  const box = $("queue-now");
  if(!box) return;
  const { queued, current, next, doneCount } = queueState();
  if(!queued.length || $("apps-list").hidden){ box.hidden = true; return; }
  box.hidden = false;
  if(!current){
    box.innerHTML = `<div class="queue-now-main"><span class="queue-now-label">✓ ສຳພາດຄົບທຸກຄິວແລ້ວ</span>
      <span class="queue-now-sub">${queued.length} ຄົນ</span></div>`;
    return;
  }
  box.innerHTML = `
    <div class="queue-now-main">
      <span class="queue-now-label">ຕອນນີ້ຮອດຄິວທີ ${queueNo(current)}</span>
      <b class="queue-now-name">${escapeHtml(current.name || "-")}</b>
      <span class="queue-now-sub">${escapeHtml(current.position || "-")} · ${escapeHtml(appBranchLabel(current))}</span>
    </div>
    <div class="queue-now-side">
      ${next ? `<span>ຖັດໄປ: <b>${escapeHtml(next.name || "-")}</b> (ຄິວທີ ${queueNo(next)})</span>` : "<span>ຄົນສຸດທ້າຍຂອງຄິວ</span>"}
      <span>ສຳພາດແລ້ວ ${doneCount} / ${queued.length} ຄົນ</span>
      <button type="button" class="btn btn--ghost btn--sm" data-goto="${escapeHtml(current.docId)}">ໄປທີ່ບັດ ↓</button>
    </div>`;
}

function formatDate(ts){
  if(!ts?.toDate) return "-";
  return ts.toDate().toLocaleString("lo-LA", { dateStyle: "medium", timeStyle: "short" });
}

function filteredApplications(){
  const q = appFilters.q.trim().toLowerCase();
  return applications.filter(a => {
    if(appFilters.branch && appBranchKey(a) !== appFilters.branch) return false;
    if(appFilters.dept && (a.department || "") !== appFilters.dept) return false;
    if(appFilters.position && (a.position || "") !== appFilters.position) return false;
    if(appFilters.status && (a.status || "new") !== appFilters.status) return false;
    if(q){
      const hay = [a.name, a.email, a.phone, a.position, a.department, a.branch]
        .filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort(byQueue);
}

function countBy(getKey){
  const map = new Map();
  applications.forEach(a => {
    const k = getKey(a);
    if(k === "" || k == null) return;
    map.set(k, (map.get(k) || 0) + 1);
  });
  return [...map.entries()].sort((x, y) => y[1] - x[1]);
}

function fillSelect(el, allLabel, entries, selected, labelFor = k => k){
  el.innerHTML = `<option value="">${allLabel}</option>` +
    entries.map(([key, n]) =>
      `<option value="${escapeHtml(key)}">${escapeHtml(labelFor(key))} (${n})</option>`).join("");
  el.value = selected;
}

function renderFilterOptions(){
  fillSelect($("filter-branch"), `ທຸກສາຂາ (${applications.length})`,
    countBy(appBranchKey), appFilters.branch,
    k => k === NO_BRANCH ? "ບໍ່ໄດ້ລະບຸສາຂາ" : k);

  fillSelect($("filter-dept"), "ທຸກພະແນກ",
    countBy(a => a.department || ""), appFilters.dept);

  fillSelect($("filter-position"), "ທຸກຕຳແໜ່ງ",
    countBy(a => a.position || ""), appFilters.position);

  $("filter-status").innerHTML = `<option value="">ທຸກສະຖານະ</option>` +
    STATUS_OPTIONS.map(o => {
      const n = applications.filter(a => (a.status || "new") === o.value).length;
      return `<option value="${o.value}">${o.label} (${n})</option>`;
    }).join("");
  $("filter-status").value = appFilters.status;
}

/* ຄຳຕອບຈາກຊ່ອງກອກທີ່ admin ສ້າງໄວ້ */
function renderAnswers(a){
  const entries = Object.entries(a.answers || {}).filter(([, v]) => v);
  if(!entries.length) return "";
  return `<details class="app-message"><summary>ຂໍ້ມູນເພີ່ມເຕີມ (${entries.length} ລາຍການ)</summary>
    <dl class="app-answers">${entries.map(([k, v]) =>
      `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>
  </details>`;
}

/* ຫາໄຟລ໌ຮູບຈາກໄຟລ໌ແນບ — ໃຫ້ຄວາມສຳຄັນກັບຮູບ 3x4 ກ່ອນ ຖ້າບໍ່ມີຈຶ່ງເອົາຮູບທຳອິດ */
const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif)(\?|$)/i;

function findPhoto(a){
  const files = (a.attachments || []).filter(att => att && att.url);
  const images = files.filter(att => IMAGE_RE.test(att.name || "") || IMAGE_RE.test(att.url || ""));
  if(!images.length) return null;
  const portrait = images.find(att => /3\s*[xX×]\s*4|ຮູບຂອງທ່ານ|photo/i.test(att.label || ""));
  return portrait || images[0];
}

function renderPhoto(a){
  const photo = findPhoto(a);
  if(!photo){
    return `<div class="app-photo app-photo--empty">ບໍ່ມີ<br>ຮູບຖ່າຍ</div>`;
  }
  return `<div class="app-photo" data-photo="${escapeHtml(photo.url)}" title="ກົດເພື່ອເບິ່ງຮູບຂະໜາດເຕັມ">
    <img src="${escapeHtml(photo.url)}" alt="ຮູບຂອງ ${escapeHtml(a.name || "")}" loading="lazy">
  </div>`;
}

function renderAttachmentLinks(a){
  const links = [];
  (a.attachments || []).forEach(att => {
    links.push(`<a href="${escapeHtml(att.url)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">${escapeHtml(att.label)} ↗</a>`);
  });
  if(a.resumeUrl && !(a.attachments || []).length){
    links.push(`<a href="${escapeHtml(a.resumeUrl)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">ເປີດເຣຊູເມ (PDF) ↗</a>`);
  }
  return links.length ? links.join("") : `<span class="app-nolink">ບໍ່ມີໄຟລ໌ແນບ</span>`;
}

function renderApplications({ flashMoves = false } = {}){
  const listEl = $("apps-list");
  const list = filteredApplications();

  $("apps-filter-summary").textContent = applications.length
    ? `ສະແດງ ${list.length} ຈາກທັງໝົດ ${applications.length} ໃບສະໝັກ`
    : "";

  renderQueueNow();
  if(!applications.length){
    listEl.innerHTML = `<div class="admin-empty"><p>ຍັງບໍ່ມີໃບສະໝັກເຂົ້າມາ</p></div>`;
    return;
  }
  if(!list.length){
    listEl.innerHTML = `<div class="admin-empty"><p>ບໍ່ພົບໃບສະໝັກທີ່ກົງກັບຕົວກອງ</p>
      <p class="admin-empty-sub">ລອງກົດ "ລ້າງຕົວກອງ" ເພື່ອເບິ່ງທັງໝົດ</p></div>`;
    return;
  }

  /* ລຶບຂໍ້ຄວາມ placeholder (ກຳລັງໂຫຼດ / ບໍ່ພົບ) ທີ່ບໍ່ແມ່ນບັດ */
  [...listEl.children].forEach(ch => { if(!ch.classList.contains("app-card")) ch.remove(); });

  /* ລຶບບັດຂອງໃບສະໝັກທີ່ຖືກລຶບໄປແລ້ວອອກຈາກ cache */
  const alive = new Set(applications.map(a => a.docId));
  for(const id of [...cardCache.keys()]) if(!alive.has(id)) cardCache.delete(id);

  const prevPos = new Map([...listEl.children].map((c, i) => [c.dataset.docid, i]));
  const currentId = queueState().current?.docId;

  list.forEach((a, i) => {
    let card = cardCache.get(a.docId);
    if(!card){
      card = buildAppCard(a);
      cardCache.set(a.docId, card);
    } else {
      refreshAppCard(card, a);
    }
    applyQueueState(card, a, currentId);
    const at = listEl.children[i];
    if(at !== card){
      listEl.insertBefore(card, at || null);
      /* ກະພິບບັດທີ່ຖືກຍ້າຍຄິວ ໃຫ້ຜູ້ສຳພາດສັງເກດເຫັນ */
      if(flashMoves && prevPos.has(a.docId) && prevPos.get(a.docId) !== i){
        card.classList.remove("is-queue-moved");
        void card.offsetWidth;
        card.classList.add("is-queue-moved");
      }
    }
  });
  while(listEl.children.length > list.length) listEl.lastElementChild.remove();
}

function appCardHtml(a){
  return `
    <div class="app-card" data-docid="${escapeHtml(a.docId)}">
     <div class="app-card-row">
      ${renderPhoto(a)}
      <div class="app-card-main">
        <div class="app-card-top">
          <span class="queue-slot">${queueBadgeHtml(a)}</span>
          <h3>${escapeHtml(a.name)}</h3>
          <span class="app-status app-status--${escapeHtml(a.status || "new")}">${
            escapeHtml(STATUS_OPTIONS.find(s => s.value === a.status)?.label || a.status || "ໃໝ່")}</span>
        </div>
        <p class="app-position">${escapeHtml(a.position)} — ${escapeHtml(a.department)}
          ${a.advanceProfile ? '<span class="app-status" style="background:var(--brass-soft);color:var(--gold-text);margin-left:8px">ຝາກປະຫວັດລ່ວງໜ້າ</span>' : ""}</p>
        <div class="app-meta">
          <span><b>🏢 ສາຂາ: ${escapeHtml(appBranchLabel(a))}</b></span>
          <span>📧 ${escapeHtml(a.email)}</span>
          <span>📞 ${escapeHtml(a.phone)}</span>
          <span>🕐 ${formatDate(a.submittedAt)}</span>
        </div>
        ${renderAnswers(a)}
        ${a.coverMessage ? `<details class="app-message"><summary>ຂໍ້ຄວາມຈາກຜູ້ສະໝັກ</summary><p>${escapeHtml(a.coverMessage)}</p></details>` : ""}
        <div class="app-links">
          ${renderAttachmentLinks(a)}
        </div>
        ${renderEvalBlock(a)}
      </div>
     </div>
    </div>
  `;
}

/* ສ້າງບັດໃໝ່ 1 ໃບ ພ້ອມຜູກ event (ເຮັດຄັ້ງດຽວຕໍ່ໃບສະໝັກ) */
function buildAppCard(a){
  const t = document.createElement("template");
  t.innerHTML = appCardHtml(a).trim();
  const card = t.content.firstElementChild;
  card.querySelectorAll("[data-photo]").forEach(el => {
    el.addEventListener("click", () => openLightbox(el.dataset.photo));
  });
  bindEvalHandlers(card);
  return card;
}

/* ອັບເດດສະເພາະສ່ວນທີ່ admin ປ່ຽນໄດ້ (ຄິວ + ສະຖານະ) ບໍ່ແຕະສ່ວນໃຫ້ຄະແນນ */
function refreshAppCard(card, a){
  const slot = card.querySelector(".queue-slot");
  if(slot) slot.innerHTML = queueBadgeHtml(a);
  const st = card.querySelector(".app-card-top .app-status");
  if(st){
    st.className = "app-status app-status--" + (a.status || "new");
    st.textContent = STATUS_OPTIONS.find(s => s.value === a.status)?.label || a.status || "ໃໝ່";
  }
}

/* ==========================================================================
   ໃຫ້ຄະແນນສຳພາດ
   ເກັບຢູ່ collection "evaluations" — 1 ຜູ້ສຳພາດ ຕໍ່ 1 ຜູ້ສະໝັກ = 1 ເອກະສານ
   docId = `${applicationId}__${interviewerUid}` ຈຶ່ງບັນທຶກທັບຕົວເກົ່າໄດ້ເລີຍ
   ========================================================================== */
async function loadCriteria(){
  try {
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, "interviewCriteria"));
    const list = snap.exists() ? snap.data().criteria : null;
    criteria = (Array.isArray(list) && list.length) ? list : DEFAULT_CRITERIA;
    SCALE = (snap.exists() && SCALES[snap.data().scale]) || SCALES.rank5;
  } catch (err){
    console.warn("ໂຫຼດຫົວຂໍ້ຄະແນນບໍ່ໄດ້ ໃຊ້ຄ່າເລີ່ມຕົ້ນແທນ:", err);
    criteria = DEFAULT_CRITERIA;
  }
  criteria = criteria.map((c, i) => ({
    id: c.id || ("c" + (i + 1)),
    label_la: c.label_la || c.label || ("ຫົວຂໍ້ " + (i + 1)),
    label_en: c.label_en || ""
  }));
}

function loadEvaluations(){
  return new Promise((resolve) => {
    onSnapshot(collection(db, EVALUATIONS_COLLECTION), (snap) => {
      evaluations = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      
      if (applications.length > 0) {
        // อัปเดตตารางจัดอันดับ
        renderScoreboard(); 
        
        // อัปเดตคะแนนคนอื่นในหน้ารายชื่อ โดยไม่กระทบสิ่งที่กำลังพิมพ์
        updateLiveEvaluations(); 
      }
      resolve(); 
    }, (err) => {
      console.warn("ໂຫຼດຄະແນນບໍ່ໄດ້ (Real-time):", err);
      resolve(); 
    });
  });
}

const evalId = appId => `${appId}__${ME.uid}`;
const evalsOf = appId => evaluations.filter(e => e.applicationId === appId);
const myEvalOf = appId => evaluations.find(e => e.applicationId === appId && e.interviewerUid === ME.uid);

/* ຄະແນນເຕັມຂອງໃບປະເມີນ — ໃບເກົ່າທີ່ບໍ່ມີ scaleMax ແມ່ນໃຫ້ 0–5 */
const evalMax = ev => (typeof ev?.scaleMax === "number" && ev.scaleMax > 0) ? ev.scaleMax : 5;

/* ຄ່າສະເລ່ຍຂອງໃບປະເມີນໜຶ່ງໃບ (ນັບສະເພາະຫົວຂໍ້ທີ່ໃຫ້ຄະແນນແລ້ວ)
   ປັບເປັນສະເກວປັດຈຸບັນ ເພື່ອໃຫ້ໃບທີ່ໃຫ້ຄະແນນຄົນລະຮູບແບບ ທຽບກັນໄດ້ */
function evalAverage(ev){
  const vals = criteria
    .map(c => ev?.scores?.[c.id]?.score)
    .filter(v => typeof v === "number");
  if(!vals.length) return null;
  const raw = vals.reduce((a, b) => a + b, 0) / vals.length;
  return raw * SCALE.max / evalMax(ev);
}

/* ຂໍ້ຄວາມຄະແນນຂອງ 1 ຫົວຂໍ້ ສຳລັບຕາຕະລາງ */
function scoreCellText(ev, critId){
  const s = ev?.scores?.[critId]?.score;
  if(typeof s !== "number") return "-";
  if(evalMax(ev) === SCALES.pass3.max){
    return SCALES.pass3.options.find(o => o.value === s)?.label ?? String(s);
  }
  return String(s);
}

/* ຄ່າສະເລ່ຍລວມຂອງຜູ້ສະໝັກ 1 ຄົນ ຈາກທຸກຜູ້ສຳພາດ */
function appAverage(appId){
  const avgs = evalsOf(appId).map(evalAverage).filter(v => v !== null);
  if(!avgs.length) return { avg: null, count: 0 };
  return { avg: avgs.reduce((a, b) => a + b, 0) / avgs.length, count: avgs.length };
}

const fmt = n => (n === null || n === undefined) ? "-" : n.toFixed(2);

/* ຊື່ຜູ້ສຳພາດທີ່ຈະສະແດງ — ຖ້າໃບເກົ່າບໍ່ມີຊື່ ໃຫ້ໃຊ້ສ່ວນໜ້າຂອງອີເມວແທນ */
function interviewerLabel(ev){
  if(ev.interviewerName) return ev.interviewerName;
  if(ev.interviewerUid === ME.uid && ME.name) return ME.name;
  return (ev.interviewerEmail || "ຜູ້ສຳພາດ").split("@")[0];
}

function scoreChipsHtml(critId, current){
  const wide = SCALE !== SCALES.rank5;
  return SCALE.options.map(o =>
    `<button type="button" class="score-chip ${wide ? "score-chip--text" : ""} ${o.cls || ""} ${current === o.value ? "is-active" : ""}"
       data-crit="${escapeHtml(critId)}" data-score="${o.value}">${escapeHtml(o.label)}</button>`).join("");
}

function renderEvalBlock(a){
  const mine = myEvalOf(a.docId);
  const myAvg = evalAverage(mine);
  const { avg, count } = appAverage(a.docId);

  const others = evalsOf(a.docId)
    .filter(e => e.interviewerUid !== ME.uid)
    .map(e => `<div>• <b>${escapeHtml(interviewerLabel(e))}</b> — ${fmt(evalAverage(e))}/${SCALE.max}${
      e.overallComment ? ` — ${escapeHtml(e.overallComment)}` : ""}</div>`).join("");

  const rows = criteria.map(c => {
    const cur = mine?.scores?.[c.id] || {};
    return `
      <div class="eval-row">
        <div class="eval-label">${escapeHtml(c.label_la)}</div>
        <div class="score-chips">${scoreChipsHtml(c.id, evalMax(mine) === SCALE.max ? cur.score : null)}</div>
        <input type="text" class="eval-comment" data-crit-comment="${escapeHtml(c.id)}"
               value="${escapeHtml(cur.comment || "")}" placeholder="ຄຳເຫັນສຳລັບຫົວຂໍ້ນີ້ (ບໍ່ບັງຄັບ)">
      </div>`;
  }).join("");

  return `
    <details class="app-message eval-block">
      <summary>ໃຫ້ຄະແນນສຳພາດ ${myAvg !== null ? `— ຂອງທ່ານ ${fmt(myAvg)}/${SCALE.max}` : "(ຍັງບໍ່ໄດ້ໃຫ້ຄະແນນ)"}${
        count ? ` · ສະເລ່ຍລວມ ${fmt(avg)}/${SCALE.max} ຈາກ ${count} ຜູ້ສຳພາດ` : ""}</summary>
      <div data-eval-app="${escapeHtml(a.docId)}">
        ${rows}
        <div class="eval-row">
          <div class="eval-label">ສະຫຼຸບລວມ / ຂໍ້ສັງເກດ</div>
          <input type="text" class="eval-comment" data-overall
                 value="${escapeHtml(mine?.overallComment || "")}" placeholder="ເຊັ່ນ ເໝາະສົມກັບຕຳແໜ່ງນີ້ ແນະນຳໃຫ້ຮັບ">
        </div>
        <div class="eval-actions">
          <button type="button" class="btn btn--primary btn--sm" data-eval-save>ບັນທຶກຄະແນນ</button>
          <span class="eval-mine" data-eval-status></span>
        </div>
        ${others ? `<div class="eval-others"><b>ຄະແນນຈາກຜູ້ສຳພາດຄົນອື່ນ:</b>${others}</div>` : ""}
      </div>
    </details>`;
}

function bindEvalHandlers(root){
  root.querySelectorAll("[data-eval-app]").forEach(box => {
    const appId = box.dataset.evalApp;

    box.querySelectorAll(".score-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        box.querySelectorAll(`.score-chip[data-crit="${CSS.escape(chip.dataset.crit)}"]`)
           .forEach(c => c.classList.remove("is-active"));
        chip.classList.add("is-active");
      });
    });

    box.querySelector("[data-eval-save]").addEventListener("click", () => saveEvaluation(appId, box));
  });
}

async function saveEvaluation(appId, box){
  const statusEl = box.querySelector("[data-eval-status]");
  const btn = box.querySelector("[data-eval-save]");
  const scores = {};
  let given = 0;
  let totalScore = 0; // เพิ่มตัวแปรสำหรับรวมคะแนนเพื่อหาค่าเฉลี่ย

  criteria.forEach(c => {
    const active = box.querySelector(`.score-chip[data-crit="${CSS.escape(c.id)}"].is-active`);
    const comment = box.querySelector(`[data-crit-comment="${CSS.escape(c.id)}"]`)?.value.trim() || "";
    if(active || comment){
      const scoreVal = active ? Number(active.dataset.score) : null;
      scores[c.id] = {
        label: c.label_la,
        score: scoreVal,
        comment
      };
      if(active) {
        given++;
        totalScore += scoreVal;
      }
    }
  });

  if(!given){
    Swal.fire({
      icon: 'warning',
      title: 'ແຈ້ງເຕືອນ',
      text: 'ກະລຸນາໃຫ້ຄະແນນຢ່າງໜ້ອຍ 1 ຫົວຂໍ້',
      confirmButtonColor: '#4f46e5'
    });
    return;
  }

  // คำนวณคะแนนเฉลี่ยก่อนบันทึก
  const avgScore = totalScore / given;

  // เด้ง Popup แจ้งเตือนด้วย SweetAlert2
  const result = await Swal.fire({
    icon: 'success',
    title: 'ຢືນຢັນການໃຫ້ຄະແນນ?',
    html: `ຄະແນນສະເລ່ຍຂອງທ່ານຄື: <b style="color:#4f46e5; font-size:18px;">${avgScore.toFixed(2)}/${SCALE.max}</b><br>ທ່ານຕ້ອງການບັນທຶກຄະແນນນີ້ເລີຍຫຼືບໍ່?`,
    showCancelButton: true,
    confirmButtonColor: '#4f46e5',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: 'ຢືນຢັນ (ບັນທຶກ)',
    cancelButtonText: 'ແກ້ໄຂອີກຄັ້ງ',
    reverseButtons: true // สลับปุ่มยืนยันไว้ขวามือให้คุ้นชิน
  });

  // ถ้าผู้ใช้กด "แก้ไขอีกครั้ง" (Cancel) ให้หยุดการทำงาน
  if (!result.isConfirmed) {
    return;
  }

  // ถ้ากดยืนยัน เริ่มกระบวนการบันทึกลง Firebase
  const app = applications.find(a => a.docId === appId);
  const payload = {
    applicationId: appId,
    applicantName: app?.name || "",
    position: app?.position || "",
    branch: app?.branch || "",
    interviewerUid: ME.uid,
    interviewerEmail: ME.email,
    interviewerName: ME.name || ME.email,
    scores,
    scaleMax: SCALE.max,
    overallComment: box.querySelector("[data-overall]")?.value.trim() || "",
    updatedAt: serverTimestamp()
  };

  btn.disabled = true;
  statusEl.textContent = "ກຳລັງບັນທຶກ...";
  
  try {
    // บันทึกลงฐานข้อมูล[cite: 2]
    await setDoc(doc(db, EVALUATIONS_COLLECTION, evalId(appId)), payload);
    
    // อัปเดตข้อมูลในหน่วยความจำ
    const idx = evaluations.findIndex(e => e.docId === evalId(appId));
    const local = { docId: evalId(appId), ...payload, updatedAt: new Date() };
    if(idx >= 0) evaluations[idx] = local; else evaluations.push(local);

    statusEl.textContent = `ບັນທຶກແລ້ວ — ຄະແນນຂອງທ່ານ ${fmt(avgScore)}/${SCALE.max}`;
    
    // อัปเดตตารางคะแนนแบบ Real-time (ฟังก์ชันที่เพิ่มไปก่อนหน้านี้)
    if (typeof updateLiveEvaluations === "function") {
        updateLiveEvaluations();
    }
    renderScoreboard();

    // ปิดแท็บ (<details>) ทันทีเมื่อบันทึกเสร็จ
    const detailsEl = box.closest("details");
    if (detailsEl) {
      detailsEl.open = false;
    }

    // (Optional) Popup เล็กๆ แจ้งเตือนมุมขวาบนว่าบันทึกสำเร็จจริงๆ
    Swal.fire({
      icon: 'success',
      title: 'ບັນທຶກສຳເລັດ',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000
    });

  } catch (err){
    console.error(err);
    Swal.fire({ icon: 'error', title: 'ຜິດພາດ', text: 'ບໍ່ສາມາດບັນທຶກໄດ້: ' + err.message });
    statusEl.textContent = "ບັນທຶກບໍ່ສຳເລັດ: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

/* ==========================================================================
   ແທັບ "ຜົນຄະແນນລວມ / ຈັດອັນດັບ"
   ========================================================================== */
/* ຮູບ 3x4 ຂອງຜູ້ສະໝັກ ພ້ອມປ້າຍອັນດັບມຸມຊ້າຍ */
function rankPhotoHtml(a, i){
  const photo = findPhoto(a);
  const medal = i < 3 ? "rank-" + (i + 1) : "";
  return `
    <div class="rank-photo" ${photo ? `data-photo="${escapeHtml(photo.url)}" title="ກົດເພື່ອເບິ່ງຮູບຂະໜາດເຕັມ"` : 'style="cursor:default"'}>
      <div class="rank-img">
        ${photo
          ? `<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(a.name || "")}" loading="lazy">`
          : "ບໍ່ມີ<br>ຮູບ"}
      </div>
      <span class="rank-no ${medal}">${i + 1}</span>
    </div>`;
}

function renderScoreboard(){
  const listEl = $("scores-list");
  const ranked = applications
    .map(a => ({ a, ...appAverage(a.docId) }))
    .filter(x => x.count > 0)
    .sort((x, y) => y.avg - x.avg);

  const notScored = applications.length - ranked.length;
  $("scores-summary").textContent = applications.length
    ? `ໃຫ້ຄະແນນແລ້ວ ${ranked.length} ຄົນ · ຍັງບໍ່ໄດ້ໃຫ້ຄະແນນ ${notScored} ຄົນ`
    : "";

  if(!ranked.length){
    listEl.innerHTML = `<div class="admin-empty"><p>ຍັງບໍ່ມີການໃຫ້ຄະແນນ</p>
      <p class="admin-empty-sub">ໄປທີ່ແທັບ "ໃບສະໝັກ" ແລ້ວກົດ "ໃຫ້ຄະແນນສຳພາດ" ໃນບັດຂອງຜູ້ສະໝັກ</p></div>`;
    return;
  }

  listEl.innerHTML = ranked.map((x, i) => {
    const evs = evalsOf(x.a.docId);
    const rows = evs.map(ev => `
      <tr>
        <td><b>${escapeHtml(interviewerLabel(ev))}</b></td>
        ${criteria.map(c => `<td>${escapeHtml(scoreCellText(ev, c.id))}</td>`).join("")}
        <td><b>${fmt(evalAverage(ev))}</b></td>
        <td>${escapeHtml(ev.overallComment || "")}</td>
      </tr>`).join("");

    const comments = evs.flatMap(ev =>
      criteria.filter(c => ev.scores?.[c.id]?.comment)
        .map(c => `<div>• <b>${escapeHtml(c.label_la)}</b> (${escapeHtml(interviewerLabel(ev))}): ${escapeHtml(ev.scores[c.id].comment)}</div>`)
    ).join("");

    return `
      <div class="rank-card">
        <div>
          ${rankPhotoHtml(x.a, i)}
          <label class="rank-check">
            <input type="checkbox" class="print-pick" data-app="${escapeHtml(x.a.docId)}" checked>
            <span>ພິມ</span>
          </label>
        </div>
        <div class="rank-body">
          <h3 style="margin:0 0 4px;font-size:17px;font-weight:800;color:#0f172a">${escapeHtml(x.a.name)}</h3>
          <div class="app-meta" style="margin:0">
            <span>${escapeHtml(x.a.position || "-")} — ${escapeHtml(x.a.department || "-")}</span>
            <span>🏢 ${escapeHtml(appBranchLabel(x.a))}</span>
            <span>👤 ${x.count} ຜູ້ສຳພາດ</span>
          </div>
          <div class="rank-bar"><i style="width:${(x.avg / SCALE.max * 100).toFixed(1)}%"></i></div>
          <details class="rank-detail">
            <summary>ເບິ່ງລາຍລະອຽດຄະແນນ</summary>
            <table>
              <thead>
                <tr><th>ຜູ້ສຳພາດ</th>${criteria.map(c => `<th>${escapeHtml(c.label_la)}</th>`).join("")}<th>ສະເລ່ຍ</th><th>ສະຫຼຸບ</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            ${comments ? `<div class="eval-others" style="margin-top:10px">${comments}</div>` : ""}
          </details>
        </div>
        <div class="rank-score">
          <b>${fmt(x.avg)}</b>
          <span>ຈາກ ${SCALE.max} ຄະແນນ</span>
        </div>
      </div>`;
  }).join("");

  bindScoreboardExtras();
}

/* ---------- ສະຫຼັບແທັບ ---------- */
document.querySelectorAll(".view-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".view-tab").forEach(t => t.classList.toggle("is-active", t === tab));
    const showApps = tab.dataset.view === "apps";
    document.querySelectorAll(".apps-only").forEach(el => { el.hidden = !showApps; });
    $("apps-list").hidden = !showApps;
    $("scores-panel").hidden = showApps;
    renderQueueNow();
    if(!showApps) renderScoreboard();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

function bindScoreboardExtras(){
  const listEl = $("scores-list");
  listEl.querySelectorAll(".rank-photo[data-photo]").forEach(el => {
    el.addEventListener("click", () => openLightbox(el.dataset.photo));
  });
  listEl.querySelectorAll(".print-pick").forEach(cb => {
    cb.addEventListener("change", updatePrintSelection);
  });
  updatePrintSelection();
}

/* ບັດທີ່ບໍ່ໄດ້ຕິກ ຈະຖືກໝາຍໄວ້ ແລ້ວຈະບໍ່ຖືກພິມອອກມາ */
function updatePrintSelection(){
  const picks = [...$("scores-list").querySelectorAll(".print-pick")];
  picks.forEach(cb => {
    cb.closest(".rank-card")?.classList.toggle("print-skip", !cb.checked);
  });
  const n = picks.filter(cb => cb.checked).length;
  const el = $("scores-selected");
  if(el) el.textContent = `ຈະພິມ ${n} ຄົນ ຈາກ ${picks.length} ຄົນ`;
}

$("scores-select-all").addEventListener("click", () => {
  $("scores-list").querySelectorAll(".print-pick").forEach(cb => { cb.checked = true; });
  updatePrintSelection();
});
$("scores-select-none").addEventListener("click", () => {
  $("scores-list").querySelectorAll(".print-pick").forEach(cb => { cb.checked = false; });
  updatePrintSelection();
});
$("scores-print-btn").addEventListener("click", () => {
  const n = $("scores-list").querySelectorAll(".print-pick:checked").length;
  if(!n){
    alert("ກະລຸນາຕິກເລືອກຢ່າງໜ້ອຍ 1 ຄົນກ່ອນພິມ");
    return;
  }
  /* ກາງລາຍລະອຽດຄະແນນຂອງຄົນທີ່ຕິກໄວ້ ເພື່ອໃຫ້ຕິດໄປໃນເອກະສານທີ່ພິມ */
  $("scores-list").querySelectorAll(".rank-card:not(.print-skip) .rank-detail")
    .forEach(d => { d.open = true; });
  window.print();
});

/* ---------- ເບິ່ງຮູບຂະໜາດເຕັມ ---------- */
const lightbox = $("photo-lightbox");
function openLightbox(url){
  $("photo-lightbox-img").src = url;
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeLightbox(){
  lightbox.hidden = true;
  $("photo-lightbox-img").src = "";
  document.body.style.overflow = "";
}
lightbox.addEventListener("click", closeLightbox);
document.addEventListener("keydown", e => { if(e.key === "Escape" && !lightbox.hidden) closeLightbox(); });

/* ---------- ຕົວກອງ ---------- */
$("filter-branch").addEventListener("change",   e => { appFilters.branch   = e.target.value; renderApplications(); });
$("filter-dept").addEventListener("change",     e => { appFilters.dept     = e.target.value; renderApplications(); });
$("filter-position").addEventListener("change", e => { appFilters.position = e.target.value; renderApplications(); });
$("filter-status").addEventListener("change",   e => { appFilters.status   = e.target.value; renderApplications(); });
$("filter-search").addEventListener("input",    e => { appFilters.q        = e.target.value; renderApplications(); });

$("clear-filters-btn").addEventListener("click", () => {
  appFilters.branch = appFilters.dept = appFilters.position = appFilters.status = appFilters.q = "";
  $("filter-search").value = "";
  renderFilterOptions();
  renderApplications();
});
/* ---------- ປິດ-ເປີດ ຄົ້ນຫາແບບພິເສດ ---------- */
const toggleAdvBtn = $("toggle-advanced-search");
const advFiltersBox = $("advanced-filters");

if (toggleAdvBtn && advFiltersBox) {
  toggleAdvBtn.addEventListener("click", () => {
    // ສະຫຼັບ Class ເພື່ອເປີດ-ປິດ Slide
    const isOpen = advFiltersBox.classList.toggle("is-open");
    // ປ່ຽນຂໍ້ຄວາມເທິງປຸ່ມ
    toggleAdvBtn.textContent = isOpen ? "- ປິດຄົ້ນຫາແບບພິເສດ" : "+ ຄົ້ນຫາແບບພິເສດ";
  });
}
$("my-name").addEventListener("input", e => {
  ME.name = e.target.value.trim();
  try { localStorage.setItem("ssmi-my-name", ME.name); } catch (err){}
});

/* ປຸ່ມ "ໄປທີ່ບັດ" ໃນປ້າຍຄິວ */
$("queue-now")?.addEventListener("click", e => {
  const id = e.target.closest("[data-goto]")?.dataset.goto;
  const card = id && cardCache.get(id);
  if(card?.isConnected){
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if(id){
    alert("ບັດນີ້ຖືກເຊື່ອງດ້ວຍຕົວກອງ — ກົດ \"ລ້າງຕົວກອງ\" ກ່ອນ");
  }
});

$("reload-apps-btn").addEventListener("click", () => {
  cardCache.clear();
  $("apps-list").innerHTML = "";
  renderApplications();
  renderScoreboard();
});
$("print-btn").addEventListener("click", () => window.print());

/* ฟังก์ชันสำหรับอัปเดตคะแนนแบบ Real-time โดยไม่รีเฟรชช่องที่กำลังพิมพ์ */
function updateLiveEvaluations() {
  // หาบล็อกการประเมินทั้งหมดที่แสดงอยู่บนหน้าจอ
  const evalBoxes = document.querySelectorAll("[data-eval-app]");
  
  evalBoxes.forEach(box => {
    const appId = box.dataset.evalApp;
    
    // 1. คำนวณค่าเฉลี่ยใหม่ล่าสุด
    const mine = myEvalOf(appId);
    const myAvg = evalAverage(mine);
    const { avg, count } = appAverage(appId);
    
    // 2. อัปเดตข้อความใน <summary> (ส่วนหัวที่บอกคะแนนรวม)
    const detailsEl = box.closest("details");
    if (detailsEl) {
      const summaryEl = detailsEl.querySelector("summary");
      if (summaryEl) {
        summaryEl.textContent = `ໃຫ້ຄະແນນສຳພາດ ${myAvg !== null ? `— ຂອງທ່ານ ${fmt(myAvg)}/${SCALE.max}` : "(ຍັງບໍ່ໄດ້ໃຫ້ຄະແນນ)"}${
          count ? ` · ສະເລ່ຍລວມ ${fmt(avg)}/${SCALE.max} ຈາກ ${count} ຜູ້ສຳພາດ` : ""}`;
      }
    }
    
    // 3. อัปเดตรายชื่อและคะแนนของกรรมการคนอื่นด้านล่าง
    const others = evalsOf(appId)
      .filter(e => e.interviewerUid !== ME.uid)
      .map(e => `<div>• <b>${escapeHtml(interviewerLabel(e))}</b> — ${fmt(evalAverage(e))}/${SCALE.max}${
        e.overallComment ? ` — ${escapeHtml(e.overallComment)}` : ""}</div>`).join("");
        
    let othersDiv = box.querySelector(".eval-others");
    if (others) {
      if (!othersDiv) {
        // ถ้ายังไม่มี div นี้ให้สร้างขึ้นมาใหม่ต่อท้าย
        othersDiv = document.createElement("div");
        othersDiv.className = "eval-others";
        box.appendChild(othersDiv);
      }
      // ใส่ข้อมูลคนอื่นลงไป
      othersDiv.innerHTML = `<b>ຄະແນນຈາກຜູ້ສຳພາດຄົນອື່ນ:</b>${others}`;
    } else if (othersDiv) {
      // ถ้าไม่มีคนอื่นให้คะแนนแล้ว (เช่นถูกลบ) ให้เอา div ออก
      othersDiv.remove();
    }
  });
}