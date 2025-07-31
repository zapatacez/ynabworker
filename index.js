/**
 * Cloudflare Worker to proxy requests to the YNAB API.
 *
 * - Handles GET and POST requests.
 * - Reads YNAB_TOKEN and YNAB_BUDGET_ID from environment variables.
 * - Forwards requests to the correct YNAB API endpoint.
 * - Handles CORS preflight (OPTIONS) requests and adds CORS headers to responses.
 */

// Define CORS headers that will be added to responses.
// This allows any origin to access the worker, which is useful for
// web apps hosted on services like GitHub Pages.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  /**
   * The main fetch handler for the worker.
   * @param {Request} request The incoming request from the client.
   * @param {object} env The environment variables configured in the Cloudflare dashboard.
   * @returns {Promise<Response>} The response to send back to the client.
   */
  async fetch(request, env) {
    // 1. Check for required environment variables.
    // If these are not set, the worker cannot function correctly.
    if (!env.YNAB_TOKEN || !env.YNAB_BUDGET_ID) {
      return new Response('Server configuration error: Missing YNAB_TOKEN or YNAB_BUDGET_ID.', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // 2. Handle CORS preflight requests (OPTIONS method).
    // Browsers send these before a cross-origin request to check permissions.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // 3. Construct the target YNAB API URL.
    const url = new URL(request.url);
    // The path and query from the incoming request are appended to the base YNAB API URL.
    // e.g., /categories -> https://api.ynab.com/v1/budgets/{budgetId}/categories
    const ynabApiUrl = `https://api.ynab.com/v1/budgets/${env.YNAB_BUDGET_ID}${url.pathname}${url.search}`;

    // 4. Prepare the request to be forwarded to the YNAB API.
    // We create a new Headers object, copying headers from the original request.
    const ynabRequestHeaders = new Headers(request.headers);

    // Add the YNAB API token for authentication.
    ynabRequestHeaders.set('Authorization', `Bearer ${env.YNAB_TOKEN}`);

    // Create the request to be sent to YNAB. We pass the body stream directly
    // for efficiency, avoiding buffering it in the worker.
    const ynabRequest = new Request(ynabApiUrl, {
      method: request.method,
      headers: ynabRequestHeaders,
      body: request.body,
      redirect: 'follow',
    });

    try {
      // 5. Make the actual request to the YNAB API.
      const ynabResponse = await fetch(ynabRequest);

      // 6. Create a new response based on the YNAB API's response.
      // We need to create a new Headers object to make it mutable.
      const responseHeaders = new Headers(ynabResponse.headers);

      // Add the CORS headers to the final response so the browser will accept it.
      Object.entries(corsHeaders).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });

      // Return the response to the original client.
      return new Response(ynabResponse.body, {
        status: ynabResponse.status,
        statusText: ynabResponse.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      // Handle network errors or other exceptions during the fetch.
      console.error('Error fetching from YNAB API:', error);
      return new Response('An error occurred while proxying the request.', {
        status: 502, // Bad Gateway is an appropriate status code here.
        headers: corsHeaders, // Include CORS headers in error responses too.
      });
    }
  },
};
