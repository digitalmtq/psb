// netlify/functions/auth-login.js

exports.handler = async function (event) {
  // ---- CORS / preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  // ---- Parse body
  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body harus JSON" });
  }
  const { username, password } = body;
  if (!username || !password) {
    return json(400, { error: "username & password wajib diisi" });
  }

  // ---- Env & target file(s)
  const token = process.env.PSB_TOKEN;
  const repo  = process.env.PSB_REPO || "digitalmtq/psbserver";
  const ref   = process.env.PSB_REF  || "main";
  // coba multi-path: bisa override via env PSB_PATHS (dipisah koma), default: .user.json, user.json
  const pathList = (process.env.PSB_PATHS
    ? String(process.env.PSB_PATHS).split(",")
    : [".user.json", "user.json"]
  ).map(s => s.trim()).filter(Boolean);

  if (!token) {
    return json(500, { error: "PSB_TOKEN tidak ditemukan di environment Netlify." });
  }

  // ---- Ambil & parse users.json
  let usersRaw = null;
  let lastErr  = null;

  for (const path of pathList) {
    const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "netlify-auth-login"
        }
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        lastErr = { status: res.status, statusText: res.statusText, response: text.slice(0, 300), path };
        continue; // coba path berikutnya
      }
      const payload = await res.json();
      if (!payload?.content) {
        lastErr = { status: 502, statusText: "Missing content", response: "GitHub response tidak memiliki field 'content' base64.", path };
        continue;
      }
      usersRaw = Buffer.from(payload.content, "base64").toString("utf-8");
      break; // sukses
    } catch (e) {
      lastErr = { status: 500, statusText: "Exception", response: String(e?.message || e), path };
      continue;
    }
  }

  if (usersRaw == null) {
    return json(502, {
      error: "Gagal mengambil file users dari GitHub.",
      hint: "Cek PSB_TOKEN scope (repo), PSB_REPO, PSB_REF, dan nama file (.user.json / user.json).",
      detail: lastErr
    });
  }

  let usersParsed;
  try {
    usersParsed = JSON.parse(usersRaw);
  } catch (e) {
    return json(500, {
      error: "user.json bukan JSON valid.",
      detail: String(e?.message || e)
    });
  }

  // ---- Normalisasi ke bentuk yang seragam
  const norm = normalizeUsers(usersParsed);

  // ---- Cek kredensial admin (username case-insensitive)
  const unameLower = String(username).toLowerCase();
  const admin = norm.admins.find(a => String(a.username || "").toLowerCase() === unameLower);
  if (admin) {
    if (String(admin.password ?? "") !== String(password)) {
      return json(401, { error: "Password admin salah." });
    }
    return json(200, {
      ok: true,
      session: {
        role: "admin",
        user: admin.username,
        name: admin.name || admin.username,
        nis: null,
        ts: Date.now()
      }
    });
  }

  // ---- Cek santri (username diasumsikan NIS)
  const nis = String(username).trim();
  const sObj = norm.santri[nis];
  if (!sObj) {
    return json(401, { error: "Username tidak ditemukan." });
  }
  const expectedPass = (sObj.password != null) ? String(sObj.password) : nis; // default password = NIS
  if (String(password) !== expectedPass) {
    return json(401, { error: "Password santri salah." });
  }

  return json(200, {
    ok: true,
    session: {
      role: "santri",
      user: nis,
      name: sObj.name || `NIS ${nis}`,
      nis,
      meta: { kelas: sObj.kelas || null, username: sObj.username || undefined },
      ts: Date.now()
    }
  });
};

/* =========================
   Helpers
   ========================= */
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...cors() },
    body: JSON.stringify(obj)
  };
}

// Mengubah berbagai format users → { admins: [...], santri: { [nis]: {...} } }
function normalizeUsers(input) {
  const out = { admins: [], santri: {} };

  // Format ARRAY: [{role, ...}]
  if (Array.isArray(input)) {
    for (const row of input) {
      const role = String(row.role || "").toLowerCase();
      if (role === "admin") {
        out.admins.push({
          username: row.username || row.user || row.name || "",
          password: row.password ?? "",
          name: row.name || row.username || "Admin"
        });
      } else if (role === "santri") {
        const nis = String(row.nis || row.username || "").trim();
        if (!nis) continue;
        out.santri[nis] = {
          name: row.name || nis,
          kelas: row.kelas || row.class || "",
          password: row.password, // boleh undefined → default ke NIS saat cek
          username: row.username
        };
      }
    }
    return out;
  }

  // Format OBJECT: { admins: [...], santri: { "552233": {...} } }
  if (input.admins && Array.isArray(input.admins)) {
    out.admins = input.admins.map(a => ({
      username: a.username || a.user || a.name || "",
      password: a.password ?? "",
      name: a.name || a.username || "Admin"
    }));
  }
  if (input.santri && typeof input.santri === "object") {
    for (const [nis, v] of Object.entries(input.santri)) {
      out.santri[String(nis)] = {
        name: v?.name || String(nis),
        kelas: v?.kelas || "",
        password: v?.password,
        username: v?.username
      };
    }
  }

  return out;
}
