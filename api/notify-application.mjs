/* ==========================================================================
   /api/notify-application  —  ແຈ້ງເຕືອນທາງອີເມວເມື່ອມີໃບສະໝັກໃໝ່
   ໃຊ້ແທນ Firebase Extension "Trigger Email" ທີ່ກຳລັງຈະປິດບໍລິການ (31 ມີນາ 2027)

   ເຮັດວຽກແນວໃດ:
     1. app.js ສົ່ງ POST ມາທີ່ endpoint ນີ້ ຫຼັງບັນທຶກໃບສະໝັກສຳເລັດ
     2. ຟັງຊັນນີ້ດຶງ "ລາຍຊື່ອີເມວຜູ້ຮັບ" ຈາກ Firestore (settings/notifications)
        ໂດຍກົງ — ບໍ່ເຊື່ອລາຍຊື່ທີ່ສົ່ງມາຈາກ browser
        (ກັນຄົນເອົາ endpoint ນີ້ໄປສົ່ງ spam ຫາອີເມວອື່ນ)
     3. ສົ່ງອີເມວຜ່ານ Resend API ດ້ວຍ API key ທີ່ເກັບໄວ້ໃນ Environment Variables
        ຂອງ Vercel — key ບໍ່ເຄີຍອອກມາຢູ່ຝັ່ງ browser

   ຕ້ອງຕັ້ງ Environment Variables ໃນ Vercel:
     RESEND_API_KEY   (ບັງຄັບ)  ເຊັ່ນ re_xxxxxxxx
     MAIL_FROM        (ບັງຄັບ)  ເຊັ່ນ SSMI Recruit <recruit@ssmilaos.com>
     FIREBASE_PROJECT_ID (ບັງຄັບ) ເຊັ່ນ register-ssmi
     FALLBACK_NOTIFY_EMAILS (ບໍ່ບັງຄັບ) ໃຊ້ເມື່ອດຶງຈາກ Firestore ບໍ່ໄດ້
   ========================================================================== */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/* ດຶງລາຍຊື່ອີເມວຜູ້ຮັບຈາກ Firestore ຜ່ານ REST API
   (settings/notifications ເປີດໃຫ້ອ່ານສາທາລະນະຢູ່ແລ້ວໃນ firestore.rules) */
async function getRecipients() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const fallback = (process.env.FALLBACK_NOTIFY_EMAILS || "")
    .split(",").map(s => s.trim()).filter(Boolean);

  if (!projectId) return fallback;

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/notifications`;
    const res = await fetch(url);
    if (!res.ok) return fallback;

    const doc = await res.json();
    const values = doc?.fields?.emails?.arrayValue?.values || [];
    const list = values.map(v => (v.stringValue || "").trim()).filter(Boolean);
    return list.length ? list : fallback;
  } catch (err) {
    console.error("ດຶງລາຍຊື່ອີເມວຈາກ Firestore ບໍ່ໄດ້:", err);
    return fallback;
  }
}

const esc = str => String(str ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ປະກອບເນື້ອອີເມວເປັນ HTML */
function buildHtml(d) {
  const rows = [
    ["ຕຳແໜ່ງ", d.position],
    ["ປະຈຳ", d.branch || "-"],
    ["ຊື່ ແລະ ນາມສະກຸນ", d.name],
    ["ອີເມວ", d.email],
    ["ເບີໂທລະສັບ", d.phone]
  ].map(([k, v]) => `
    <tr>
      <td style="padding:8px 14px;background:#f8fafc;font-weight:700;color:#334155;white-space:nowrap">${esc(k)}</td>
      <td style="padding:8px 14px;color:#0f172a">${esc(v)}</td>
    </tr>`).join("");

  const answers = Object.entries(d.answers || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `
      <tr>
        <td style="padding:6px 14px;color:#64748b;white-space:nowrap">${esc(k)}</td>
        <td style="padding:6px 14px;color:#0f172a">${esc(v)}</td>
      </tr>`).join("");

  const files = (d.attachments || [])
    .map(a => `<li style="margin:4px 0"><a href="${esc(a.url)}" style="color:#4f46e5">${esc(a.label || a.name)}</a></li>`)
    .join("") || "<li style='color:#94a3b8'>ບໍ່ມີໄຟລ໌ແນບ</li>";

  return `
  <div style="font-family:'Noto Sans Lao',Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f1f5f9">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,.08)">
      <div style="background:linear-gradient(90deg,#4f46e5,#7c3aed);padding:20px 24px;color:#fff">
        <div style="font-size:12px;letter-spacing:2px;opacity:.85">SSMI RECRUIT</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">
          ${d.advanceProfile ? "ມີຄົນຝາກປະຫວັດໄວ້ລ່ວງໜ້າ" : "ມີໃບສະໝັກໃໝ່ເຂົ້າມາ"}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>

      ${answers ? `
        <div style="padding:16px 24px 0;font-weight:800;color:#334155;font-size:14px">ຂໍ້ມູນເພີ່ມເຕີມ</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">${answers}</table>` : ""}

      <div style="padding:16px 24px 0;font-weight:800;color:#334155;font-size:14px">ໄຟລ໌ແນບ</div>
      <ul style="margin:8px 0 0;padding:0 24px 8px 40px;font-size:13px">${files}</ul>

      <div style="padding:20px 24px 24px">
        <a href="${esc(d.adminUrl || "")}" style="display:inline-block;background:linear-gradient(90deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:700;font-size:14px">
          ເປີດແຜງຄວບຄຸມ
        </a>
      </div>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:16px">
      ອີເມວນີ້ຖືກສົ່ງອັດຕະໂນມັດຈາກລະບົບຮັບສະໝັກງານ SSMI
    </p>
  </div>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    console.error("ຍັງບໍ່ໄດ້ຕັ້ງ RESEND_API_KEY ຫຼື MAIL_FROM");
    return res.status(500).json({ ok: false, error: "Email not configured" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  const to = await getRecipients();
  if (!to.length) {
    return res.status(200).json({ ok: false, error: "No recipients configured" });
  }

  /* ໂໝດທົດສອບ — ກົດຈາກໜ້າ admin */
  if (body.test) {
    const r = await sendMail(apiKey, from, to,
      "[ທົດສອບ] ລະບົບແຈ້ງເຕືອນອີເມວ SSMI ໃຊ້ງານໄດ້ປົກກະຕິ",
      `<div style="font-family:'Noto Sans Lao',Arial,sans-serif;padding:24px">
         <h2 style="color:#4f46e5">ທົດສອບສຳເລັດ ✅</h2>
         <p>ຖ້າທ່ານໄດ້ຮັບອີເມວສະບັບນີ້ ໝາຍຄວາມວ່າລະບົບແຈ້ງເຕືອນເຮັດວຽກຖືກຕ້ອງແລ້ວ</p>
         <p style="color:#64748b;font-size:13px">ຜູ້ຮັບປັດຈຸບັນ: ${esc(to.join(", "))}</p>
       </div>`);
    return res.status(r.ok ? 200 : 502).json(r);
  }

  if (!body.name || !body.position) {
    return res.status(400).json({ ok: false, error: "Missing application data" });
  }

  const subject = (body.advanceProfile ? "[ຝາກປະຫວັດ] " : "ໃບສະໝັກໃໝ່: ") +
    `${body.position} (${body.department}${body.branch ? " — " + body.branch : ""})`;

  const result = await sendMail(apiKey, from, to, subject, buildHtml(body), body.email);
  return res.status(result.ok ? 200 : 502).json(result);
}

async function sendMail(apiKey, from, to, subject, html, replyTo) {
  try {
    const payload = { from, to, subject, html };
    if (replyTo) payload.reply_to = replyTo;   // ຕອບກັບໄປຫາຜູ້ສະໝັກໄດ້ເລີຍ

    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Resend error:", data);
      return { ok: false, error: data?.message || `HTTP ${r.status}` };
    }
    return { ok: true, id: data.id, sentTo: to.length };
  } catch (err) {
    console.error("ສົ່ງອີເມວລົ້ມເຫຼວ:", err);
    return { ok: false, error: err.message };
  }
}
