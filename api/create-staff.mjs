/* ==========================================================================
   /api/create-staff  —  ສ້າງບັນຊີຜູ້ໃຊ້ໃໝ່ຈາກໜ້າ admin ໂດຍກົງ
   ບໍ່ຕ້ອງເຂົ້າ Firebase Console → Authentication → Add user ອີກຕໍ່ໄປ

   ຄວາມປອດໄພ:
     - ຜູ້ເອີ້ນຕ້ອງສົ່ງ idToken ຂອງຕົນມາ ແລະ ຕ້ອງເປັນ "admin" ເທົ່ານັ້ນ
     - ກວດສິດຢູ່ຝັ່ງເຊີບເວີ ບໍ່ແມ່ນຝັ່ງ browser ຈຶ່ງປອມບໍ່ໄດ້
     - ບໍ່ໃຊ້ service account key ຈຶ່ງບໍ່ມີກະແຈລະດັບສູງເກັບໄວ້ບ່ອນໃດເລີຍ

   ຕ້ອງຕັ້ງ Environment Variables ໃນ Vercel:
     FIREBASE_API_KEY      = apiKey ຈາກ firebase-config.js
     FIREBASE_PROJECT_ID   = register-ssmi
   ========================================================================== */

const IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects";

/* ກວດ idToken ແລ້ວຄືນ uid ຂອງຜູ້ເອີ້ນ */
async function verifyCaller(apiKey, idToken) {
  const r = await fetch(`${IDENTITY}:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  const data = await r.json();
  if (!r.ok || !data.users?.length) return null;
  return { uid: data.users[0].localId, email: data.users[0].email || "" };
}

/* ອ່ານບົດບາດຈາກ staff/{uid} — ບໍ່ມີ doc = ຖືເປັນ admin (ຕາມ firestore.rules) */
async function getRole(projectId, uid, idToken) {
  const url = `${FIRESTORE}/${projectId}/databases/(default)/documents/staff/${uid}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (r.status === 404) return "admin";
  if (!r.ok) return null;
  const doc = await r.json();
  return doc?.fields?.role?.stringValue || "admin";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    return res.status(500).json({
      ok: false,
      error: "ຍັງບໍ່ໄດ້ຕັ້ງ FIREBASE_API_KEY ຫຼື FIREBASE_PROJECT_ID ໃນ Vercel"
    });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const { idToken, email, password, name, role } = body;

  if (!idToken) return res.status(401).json({ ok: false, error: "ບໍ່ພົບ idToken" });
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "ຕ້ອງມີອີເມວ ແລະ ລະຫັດຜ່ານ" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ ok: false, error: "ລະຫັດຜ່ານຕ້ອງຍາວຢ່າງໜ້ອຍ 6 ຕົວ" });
  }
  if (!["admin", "interviewer"].includes(role)) {
    return res.status(400).json({ ok: false, error: "ບົດບາດບໍ່ຖືກຕ້ອງ" });
  }

  /* ---- 1. ກວດວ່າຜູ້ເອີ້ນເປັນໃຜ ແລະ ເປັນ admin ແທ້ບໍ່ ---- */
  const caller = await verifyCaller(apiKey, idToken);
  if (!caller) return res.status(401).json({ ok: false, error: "ເຂົ້າສູ່ລະບົບໝົດອາຍຸ ກະລຸນາລ໋ອກອິນໃໝ່" });

  const callerRole = await getRole(projectId, caller.uid, idToken);
  if (callerRole !== "admin") {
    return res.status(403).json({ ok: false, error: "ສະເພາະຜູ້ດູແລລະບົບເທົ່ານັ້ນທີ່ສ້າງບັນຊີໄດ້" });
  }

  /* ---- 2. ສ້າງບັນຊີໃນ Firebase Authentication ---- */
  const signUp = await fetch(`${IDENTITY}:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: false })
  });
  const created = await signUp.json();

  if (!signUp.ok) {
    const code = created?.error?.message || "UNKNOWN";
    const readable = {
      EMAIL_EXISTS: "ອີເມວນີ້ມີບັນຊີຢູ່ແລ້ວ",
      INVALID_EMAIL: "ຮູບແບບອີເມວບໍ່ຖືກຕ້ອງ",
      WEAK_PASSWORD: "ລະຫັດຜ່ານອ່ອນເກີນໄປ (ຕ້ອງຢ່າງໜ້ອຍ 6 ຕົວ)",
      OPERATION_NOT_ALLOWED: "ຍັງບໍ່ໄດ້ເປີດໃຊ້ Email/Password ໃນ Firebase Authentication",
      ADMIN_ONLY_OPERATION: "ໂຄງການນີ້ປິດການສະໝັກເອງໄວ້ — ເປີດ Email/Password ໃນ Console ກ່ອນ"
    }[code.split(" : ")[0]] || code;
    return res.status(400).json({ ok: false, error: readable });
  }

  const newUid = created.localId;

  /* ---- 3. ບັນທຶກບົດບາດລົງ staff/{uid} ---- */
  const patch = await fetch(
    `${FIRESTORE}/${projectId}/databases/(default)/documents/staff/${newUid}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          role:  { stringValue: role },
          name:  { stringValue: name || email },
          email: { stringValue: email }
        }
      })
    }
  );

  if (!patch.ok) {
    const err = await patch.text();
    console.error("ບັນທຶກບົດບາດລົ້ມເຫຼວ:", err);
    return res.status(207).json({
      ok: false,
      uid: newUid,
      error: `ສ້າງບັນຊີສຳເລັດ (UID: ${newUid}) ແຕ່ບັນທຶກບົດບາດບໍ່ໄດ້ — ກະລຸນາໃສ່ UID ນີ້ດ້ວຍມືອີກຄັ້ງ`
    });
  }

  return res.status(200).json({ ok: true, uid: newUid, email, role });
}
