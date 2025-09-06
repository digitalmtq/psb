exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const { username, password } = JSON.parse(event.body || "{}");
    if (!username || !password) return json(400, { error: "username & password wajib diisi" });

    // PAKAI ENV YANG KONSISTEN
    const token = process.env.PSB_TOKEN; // <- pastikan ini di Netlify
    if (!token) return json(500, { error: "Server login belum dikonfigurasi (PSB_TOKEN kosong)." });

    // PAKAI REPO & FILE YANG SAMA DENGAN YANG KAMU ISI!
    const url = "https://api.github.com/repos/digitalmtq/psbserver/contents/user.json?ref=main";

    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "netlify-auth-login"
      }
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      // 404/403 dari GitHub → laporkan lebih jelas
      return json(502, { error: `Gagal mengambil data user (${res.status}). Pastikan repo/path/token benar.` });
    }

    const payload = await res.json();
    const content = Buffer.from(payload.content, "base64").toString("utf-8");

    let users;
    try {
      users = JSON.parse(content);
    } catch {
      return json(500, { error: "Format user.json tidak valid (bukan JSON)." });
    }

    const u = String(username).trim();
    const p = String(password);

    // ==== ADMIN (case-insensitive pada username) ====
    const admins = Array.isArray(users?.admins) ? users.admins : [];
    const admin = admins.find(a => String(a.username || "").trim().toLowerCase() === u.toLowerCase());
    if (admin) {
      if (String(admin.password) !== p) return json(401, { error: "Password salah." });
      return json(200, {
        ok: true,
        session: { role: "admin", user: admin.username, name: admin.name || admin.username, nis: null, ts: Date.now() }
      });
    }

    // ==== SANTRI (username berupa NIS: 5 digit ke atas) ====
    const isNis = /^\d{5,}$/.test(u);
    if (isNis) {
      const santri = users?.santri?.[u];
      if (!santri) return json(401, { error: "Username tidak ditemukan." }); // NIS tidak ada sebagai key
      // Password: kalau tidak didefinisikan, fallback ke NIS yang sama
      const expectedPass = santri.password ? String(santri.password) : u;
      if (expectedPass !== p) return json(401, { error: "Password salah." });
      return json(200, {
        ok: true,
        session: {
          role: "santri",
          user: u,
          name: santri.name || `NIS ${u}`,
          nis: u,
          meta: { kelas: santri.kelas || null },
          ts: Date.now()
        }
      });
    }

    return json(401, { error: "Username tidak ditemukan." });
  } catch (e) {
    console.error("auth-login error:", e);
    return json(500, { error: "Terjadi kesalahan pada server login." });
  }
};

function cors(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function json(status, obj){
  return { statusCode: status, headers: { "Content-Type":"application/json", ...cors() }, body: JSON.stringify(obj) };
}
