export default {
  async fetch(request, env) {
    // 1. Get the 'Code' from Foundry (sent after the user logs in)
    const { searchParams } = new URL(request.url);
    const userCode = searchParams.get('code');
    const mapId = searchParams.get('mapId'); // e.g., "The-Shadow-Central"

    if (!userCode || !mapId) return new Response("Missing Data", { status: 400 });

    try {
      // 2. Ask Patreon: "Is this user a Patron?"
      // (This involves exchanging the userCode for a User Token)
      const patreonCheck = await fetch(`https://www.patreon.com/api/oauth2/api/current_user`, {
        headers: { "Authorization": `Bearer ${userCode}` }
      });
      const userData = await patreonCheck.json();

      // 3. Check if they are in your Campaign
      // Logic: If 'userData' shows they are an active patron, proceed.
      const isAuthorized = userData.data.attributes.is_patron; 

      if (!isAuthorized) return new Response("Access Denied: Not a Patron", { status: 403 });

      // 4. If authorized, fetch from PRIVATE GitHub using your Secret Token
      const githubUrl = `https://raw.githubusercontent.com/cartorium/${mapId}/main/Shadow%20Central.json`;
      
      const githubResponse = await fetch(githubUrl, {
        headers: {
          "Authorization": `token ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github.v3.raw"
        }
      });

      return new Response(githubResponse.body, {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });

    } catch (err) {
      return new Response("Server Error", { status: 500 });
    }
  }
};