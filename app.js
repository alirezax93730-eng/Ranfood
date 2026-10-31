
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = (id) => document.getElementById(id);
const configured = SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.startsWith("PASTE_");
const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let session = null;
let profile = null;
let authMode = "login";
let cart = [];

$("menuToggle").onclick = () =>
  $("sidebar").classList.toggle("open");

document.querySelectorAll(".sidebar [data-page]").forEach(button => {
  button.onclick = () => {
    $("sidebar").classList.remove("open");
    showPage(button.dataset.page);
  };
});

$("loginTab").onclick = () => setAuthMode("login");
$("signupTab").onclick = () => setAuthMode("signup");
$("authSubmit").onclick = authenticate;

$("logoutBtn").onclick = async () => {
  if (supabase) await supabase.auth.signOut();
  session = null;
  profile = null;
  showAuth();
};

function setAuthMode(mode) {
  authMode = mode;
  $("loginTab").classList.toggle("active", mode === "login");
  $("signupTab").classList.toggle("active", mode === "signup");
  $("fullName").classList.toggle("hidden", mode === "login");
  $("authSubmit").textContent =
    mode === "login" ? "ورود" : "ساخت حساب";
  $("authMessage").textContent = "";
}

function msg(text, error = false) {
  $("authMessage").textContent = text;
  $("authMessage").className =
    "message " + (error ? "error" : "ok");
}

function normalizeIranPhone(value) {
  let n = String(value || "").replace(/[\s\-()]/g, "");
  if (n.startsWith("+")) return n;
  if (n.startsWith("0098")) return "+" + n.slice(2);
  if (n.startsWith("98")) return "+" + n;
  if (n.startsWith("0")) return "+98" + n.slice(1);
  return n;
}

async function authenticate() {
  if (!supabase) {
    msg("اتصال Supabase تنظیم نشده است.", true);
    return;
  }

  const phone = normalizeIranPhone($("phone").value);
  const password = $("password").value;

  if (!/^\+989\d{9}$/.test(phone)) {
    msg("شماره موبایل معتبر وارد کن؛ مانند 09357870599.", true);
    return;
  }

  if (password.length < 6) {
    msg("رمز عبور باید حداقل ۶ نویسه داشته باشد.", true);
    return;
  }

  $("authSubmit").disabled = true;

  try {
    if (authMode === "signup") {
      const fullName = $("fullName").value.trim();

      if (!fullName) {
        msg("نام و نام خانوادگی را وارد کن.", true);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        phone,
        password,
        options: {
          data: { full_name: fullName }
        }
      });

      if (error) throw error;

      if (!data.session) {
        msg(
          "حساب ایجاد شد، اما ورود فوری فعال نیست. تنظیمات تأیید شماره در Supabase را بررسی کن.",
          true
        );
        return;
      }

      session = data.session;
      await ensureProfile(fullName, phone);
      await enterApp();

    } else {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          phone,
          password
        });

      if (error) throw error;

      session = data.session;
      await ensureProfile();
      await enterApp();
    }

  } catch (error) {
    msg(error.message || "ورود یا ثبت‌نام ناموفق بود.", true);
  } finally {
    $("authSubmit").disabled = false;
  }
}

async function ensureProfile(name = "", phone = "") {
  const uid = session.user.id;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const payload = {
      id: uid,
      full_name:
        name || session.user.user_metadata?.full_name || "کاربر ران‌فود",
      phone:
        phone || session.user.phone || null,
      role: "customer"
    };

    const result = await supabase
      .from("profiles")
      .insert(payload)
      .select()
      .single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    profile = result.data;
  } else {
    profile = data;
  }
}

async function enterApp() {
  $("authView").classList.add("hidden");
  $("contentView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");

  $("manageNav").classList.toggle(
    "hidden",
    !["super_admin", "restaurant_manager", "employee", "courier"]
      .includes(profile.role)
  );

  $("welcomeText").textContent =
    `سلام ${profile.full_name}؛ نقش: ${roleName(profile.role)}`;

  showPage("home");
}

function roleName(role) {
  return {
    super_admin: "مدیر کل",
    restaurant_manager: "مدیر رستوران",
    employee: "کارمند",
    customer: "مشتری",
    courier: "پیک"
  }[role] || role;
}

function showAuth() {
  $("contentView").classList.add("hidden");
  $("authView").classList.remove("hidden");
  $("logoutBtn").classList.add("hidden");
}

function title(text) {
  $("pageTitle").textContent = text;
}

function money(value) {
  return Number(value || 0).toLocaleString("fa-IR") + " تومان";
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

async function showPage(page) {
  const host = $("pageContent");
  host.innerHTML = "";
  if (!profile) return;

  if (page === "home") {
    title("خانه");
    host.innerHTML = `
      <div class="grid">
        <div class="panel">
          <b>🍔 سفارش غذا</b>
          <p>رستوران‌ها و منوها را ببین.</p>
          <button class="small-btn" data-go="restaurants">
            مشاهده رستوران‌ها
          </button>
        </div>
        <div class="panel">
          <b>📦 سفارش‌های من</b>
          <p>وضعیت سفارش‌ها را پیگیری کن.</p>
          <button class="small-btn" data-go="orders">
            مشاهده سفارش‌ها
          </button>
        </div>
        <div class="panel">
          <b>👤 حساب کاربری</b>
          <p>${safe(roleName(profile.role))}</p>
        </div>
      </div>`;

    host.querySelectorAll("[data-go]").forEach(button => {
      button.onclick = () => showPage(button.dataset.go);
    });
  }

  if (page === "restaurants") await renderRestaurants(host);
  if (page === "orders") await renderOrders(host);

  if (page === "account") {
    title("حساب کاربری");
    host.innerHTML = `
      <div class="panel">
        <h3>${safe(profile.full_name)}</h3>
        <p>شماره تماس: ${safe(profile.phone || "ثبت نشده")}</p>
        <p>نقش: ${safe(roleName(profile.role))}</p>
      </div>`;
  }

  if (page === "manage") await renderManage(host);
}

async function renderRestaurants(host) {
  title("رستوران‌ها");

  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name,description,address")
    .eq("active", true)
    .order("name");

  if (error) {
    host.textContent = error.message;
    return;
  }

  if (!data?.length) {
    host.innerHTML = '<div class="empty">فعلاً رستورانی ثبت نشده است.</div>';
    return;
  }

  host.innerHTML = '<div class="grid">' +
    data.map(r => `
      <article class="restaurant-card">
        <h3>${safe(r.name)}</h3>
        <p>${safe(r.description || "")}</p>
        <p>📍 ${safe(r.address || "آدرس ثبت نشده")}</p>
        <button class="small-btn" data-id="${r.id}">
          دیدن شعبه‌ها
        </button>
      </article>
    `).join("") + "</div>";

  host.querySelectorAll("[data-id]").forEach(button => {
    button.onclick = () => renderBranches(host, button.dataset.id);
  });
}

async function renderBranches(host, restaurantId) {
  const { data, error } = await supabase
    .from("branches")
    .select("id,name,address")
    .eq("restaurant_id", restaurantId)
    .eq("active", true);

  if (error) {
    host.textContent = error.message;
    return;
  }

  host.innerHTML = '<h2>شعبه‌ها</h2>' +
    (data?.length
      ? data.map(branch => `
          <article class="restaurant-card">
            <h3>${safe(branch.name)}</h3>
            <p>${safe(branch.address || "")}</p>
            <button class="small-btn" data-branch="${branch.id}">
              مشاهده منو
            </button>
          </article>
        `).join("")
      : '<div class="empty">شعبه فعالی وجود ندارد.</div>');

  host.querySelectorAll("[data-branch]").forEach(button => {
    button.onclick = () => renderMenu(host, button.dataset.branch);
  });
}

async function renderMenu(host, branchId) {
  const { data, error } = await supabase
    .from("menu_items")
    .select("id,name,description,price,category")
    .eq("branch_id", branchId)
    .eq("is_available", true)
    .order("category");

  if (error) {
    host.textContent = error.message;
    return;
  }

  host.innerHTML = '<h2>منوی غذا</h2>' +
    (data?.length
      ? data.map(item => `
          <article class="food-card">
            <h3>${safe(item.name)}</h3>
            <p>${safe(item.description || "")}</p>
            <p>${money(item.price)}</p>
            <button class="small-btn"
              data-food="${item.id}"
              data-name="${safe(item.name)}"
              data-price="${item.price}">
              افزودن به سبد
            </button>
          </article>
        `).join("")
      : '<div class="empty">غذایی ثبت نشده است.</div>');

  host.querySelectorAll("[data-food]").forEach(button => {
    button.onclick = () => {
      cart.push({
        id: button.dataset.food,
        name: button.dataset.name,
        price: Number(button.dataset.price)
      });
      button.textContent = "اضافه شد ✓";
    };
  });
}

async function renderOrders(host) {
  title("سفارش‌های من");

  let query = supabase
    .from("orders")
    .select("id,total_price,status,payment_status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (profile.role === "customer") {
    query = query.eq("customer_id", session.user.id);
  }

  const { data, error } = await query;

  if (error) {
    host.textContent = error.message;
    return;
  }

  host.innerHTML = data?.length
    ? data.map(order => `
        <div class="order">
          <b>سفارش ${safe(order.id.slice(0, 8))}</b>
          <p>${money(order.total_price)}</p>
          <p>وضعیت: ${safe(order.status || "در انتظار تأیید")}</p>
        </div>
      `).join("")
    : '<div class="empty">هنوز سفارشی ثبت نکرده‌ای.</div>';
}

async function renderManage(host) {
  title("مدیریت");

  if (profile.role === "customer") {
    host.innerHTML =
      '<div class="empty">دسترسی مدیریت برای حساب شما فعال نیست.</div>';
    return;
  }

  host.innerHTML = `
    <div class="panel">
      <h3>پنل مدیریت</h3>
      <p>دسترسی‌ها بر اساس نقش حساب شما تعیین می‌شوند.</p>
    </div>`;
}

async function boot() {
  if (!configured) {
    $("setupNotice").classList.remove("hidden");
    $("setupNotice").textContent =
      "تنظیمات اتصال Supabase را بررسی کن.";
    return;
  }

  const { data } = await supabase.auth.getSession();
  session = data.session;

  if (session) {
    try {
      await ensureProfile();
      await enterApp();
    } catch (error) {
      showAuth();
      msg(error.message, true);
    }
  } else {
    showAuth();
  }

  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    if (!newSession) {
      profile = null;
      showAuth();
    }
  });
}

boot();
