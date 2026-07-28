/* ==========================================================================
   FIREBASE CONFIG — this is the only file you need to edit to connect
   the site to your own Firebase project.

   Where to get these values:
   Firebase Console → Project settings (⚙️) → General tab → "Your apps" →
   click the Web app (</>) → the `firebaseConfig` object is shown there.
   See README.md step 2 for the full walkthrough.
   ========================================================================== */
export const firebaseConfig = {
    apiKey: "AIzaSyDva4KThb-7OsJTwKZYqVNvyZ_wXr3KQGg",
  authDomain: "register-ssmi.firebaseapp.com",
  projectId: "register-ssmi",
  storageBucket: "register-ssmi.firebasestorage.app",
  messagingSenderId: "937377349874",
  appId: "1:937377349874:web:be12dc30257e52a929106b",
  measurementId: "G-6E126XTVX6"
};

/* ==========================================================================
   HR notification email(s) — ค่าสำรอง (fallback) เท่านั้น
   รายชื่ออีเมลจริงถูกเก็บใน Firestore (settings/notifications) และแก้ไขได้
   จากหน้า admin → แท็บ "ตั้งค่า" — ค่าด้านล่างนี้จะถูกใช้เฉพาะกรณีที่ยัง
   ไม่เคยบันทึกการตั้งค่าในหลังบ้านเลย
   ========================================================================== */
export const HR_NOTIFY_EMAILS = ["admin.hr@ssmilaos.com"];

/* Collection / storage folder names — only change these if you also
   change them to match in firestore.rules, storage.rules, and the
   extension's "Email documents collection" setting. */
export const APPLICATIONS_COLLECTION = "applications";
export const DEPARTMENTS_COLLECTION = "departments";
export const SETTINGS_COLLECTION = "settings";
export const RESUME_STORAGE_FOLDER = "resumes";
export const ATTACHMENTS_STORAGE_FOLDER = "attachments";
