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

    const token = process.env.PSB_TOKEN;
    const url = "https://api.github.com/repos/digitalmtq/psbserver/contents/.user.json?ref=main";

    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "netlify-auth-login"
      }
    });
    if (!res.ok) throw new Error(`Gagal fetch data: ${res.status} ${res.statusText}`);

    const payload = await res.json();
    const content = Buffer.from(payload.content, "base64").toString("utf-8");
    const users = JSON.parse(content);

    // Admin
    const admin = Array.isArray(users?.admins)
      ? users.admins.find(a => String(a.username) === String(username))
      : null;
    if (admin) {
      if (String(admin.password) !== String(password)) return json(401, { error: "Password salah." });
      return json(200, { ok: true, session: { role:"admin", user:admin.username, name:admin.name||admin.username, nis:null, ts:Date.now() }});
    }

    // Santri (NIS)
    const isNis = /^\d{5,}$/.test(String(username));
    const santri = users?.santri?.[String(username)];
    if (isNis) {
      if (santri?.password) {
        if (String(santri.password) !== String(password)) return json(401, { error:"Password salah." });
      } else {
        if (String(password) !== String(username)) return json(401, { error:"Password salah." });
      }
      return json(200, { ok:true, session: {
        role:"santri", user:String(username), name:santri?.name||`NIS ${username}`,
        nis:String(username), meta:{ kelas:santri?.kelas||null }, ts:Date.now()
      }});
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
