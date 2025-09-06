// netlify/functions/auth-login.js
import { Buffer } from "node:buffer";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const { username, password } = JSON.parse(event.body || "{}");
    if (!username || !password) return json(400, { error: "username & password wajib diisi" });

    const token = process.env.PSB_TOKEN;
    const url = "https://api.github.com/repos/digitalmtq/psbserver/contents/user.json?ref=main";

    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (!res.ok) throw new Error(`Gagal fetch data: ${res.status} ${res.statusText}`);

    const payload = await res.json();
    const content = Buffer.from(payload.content, "base64").toString("utf-8");
    const users = JSON.parse(content);

    // cek admin
    const admin = Array.isArray(users?.admins)
      ? users.admins.find(a => String(a.username) === String(username))
      : null;
    if (admin) {
      if (String(admin.password) !== String(password)) return json(401, { error: "Password salah." });
      return json(200, { ok: true, session: { role: "admin", user: admin.username, name: admin.name || admin.username } });
    }

    // cek santri
    const santri = users?.santri?.[String(username)];
    if (santri) {
      const expected = santri.password ? String(santri.password) : String(username);
      if (String(password) !== expected) return json(401, { error: "Password salah." });
      return json(200, { ok: true, session: { role: "santri", user: username, name: santri.name || `NIS ${username}`, kelas: santri.kelas || "" } });
    }

    return json(401, { error: "Username tidak ditemukan." });
  } catch (e) {
    console.error("auth-login error:", e);
    return json(500, { error: "Terjadi kesalahan pada server login." });
  }
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function json(status, obj) {
  return { statusCode: status, headers: { "Content-Type": "application/json", ...cors() }, body: JSON.stringify(obj) };
}
