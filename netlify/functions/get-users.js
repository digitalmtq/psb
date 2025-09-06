// CommonJS version (paling kompatibel)
exports.handler = async function () {
  const token = process.env.PSB_TOKEN;
  const githubApiUrl = "https://api.github.com/repos/digitalmtq/psbserver/contents/.user.json?ref=main";

  try {
    const response = await fetch(githubApiUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "netlify-get-users"
      }
    });

    if (!response.ok) {
      throw new Error(`Gagal fetch data: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const content = Buffer.from(result.content, "base64").toString("utf-8");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: content
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error.message })
    };
  }
};
