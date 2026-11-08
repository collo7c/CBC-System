// Thin fetch wrapper: attaches the JWT and prefixes /api.
const API = {
  base: "/api",

  token() {
    return localStorage.getItem("cbc_token");
  },
  user() {
    const raw = localStorage.getItem("cbc_user");
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem("cbc_token", token);
    localStorage.setItem("cbc_user", JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem("cbc_token");
    localStorage.removeItem("cbc_user");
  },

  async request(method, path, body, isForm) {
    const headers = {};
    const token = this.token();
    if (token) headers["Authorization"] = "Bearer " + token;
    if (!isForm) headers["Content-Type"] = "application/json";

    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });

    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }

    if (!res.ok) {
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  },

  get(path) { return this.request("GET", path); },
  post(path, body) { return this.request("POST", path, body); },
  postForm(path, formData) { return this.request("POST", path, formData, true); },
  del(path) { return this.request("DELETE", path); },
};

function requireSession(expectedRole) {
  const token = API.token();
  const user = API.user();
  if (!token || !user) {
    window.location.href = "/index.html";
    return null;
  }
  if (expectedRole && user.role !== expectedRole) {
    window.location.href = user.role === "administrator" ? "/admin.html" : "/teacher.html";
    return null;
  }
  return user;
}

async function logout() {
  API.clearSession();
  // wipe the offline copies so the next person on this device can't see them
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) { /* ignore */ }
  window.location.href = "/index.html";
}
