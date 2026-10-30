import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = (id) => document.getElementById(id);
const configured = SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("PASTE_");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
let session = null, profile = null, authMode = "login", cart = [], currentPage = "home";

$("menuToggle").onclick = () => $("sidebar").classList.toggle("open");
document.querySelectorAll(".sidebar [data-page]").forEach(b => b.onclick = () => { $("sidebar").classList.remove("open"); showPage(b.dataset.page); });
$("loginTab").onclick = () => setAuthMode("login");
$("signupTab").onclick = () => setAuthMode("signup");
$("authSubmit").onclick = authenticate;
$("logoutBtn").onclick = async () => { await supabase.auth.signOut(); session = profile = null; showAuth(); };

function setAuthMode(mode){ authMode=mode; $("loginTab").classList.toggle("active",mode==="login"); $("signupTab").classList.toggle("active",mode==="signup"); $("fullName").classList.toggle("hidden",mode==="login"); $("authSubmit").textContent=mode==="login"?"ورود":"ساخت حساب مشتری"; $("authMessage").textContent=""; }
function msg(text,error=false){$("authMessage").textContent=text;$("authMessage").className="message "+(error?"error":"ok");}
async function authenticate(){
  if(!supabase){msg("ابتدا کلید عمومی جدید Supabase را در فایل config.js قرار بده.",true);return;}
  const email=$("email").value.trim(),password=$("password").value,phone=$("phone").value.trim();
  if(!email||password.length<6){msg("ایمیل و رمز عبور حداقل ۶ کاراکتری را وارد کن.",true);return;}
  $("authSubmit").disabled=true;
  try{
    if(authMode==="signup"){
      const full_name=$("fullName").value.trim();
      if(!full_name||!phone){msg("نام و شماره تماس لازم است.",true);return;}
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name,phone}}});
      if(error)throw error;
      if(data.session){session=data.session;await ensureProfile(full_name,phone);await enterApp();}
      else msg("ثبت‌نام انجام شد. ایمیل را تأیید کن، سپس وارد شو.");
    }else{
      const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;session=data.session;await ensureProfile();await enterApp();
    }
  }catch(e){msg(e.message||"خطا در ورود",true);}finally{$("authSubmit").disabled=false;}
}
async function ensureProfile(name="",phone=""){
  const uid=session.user.id;
  let {data,error}=await supabase.from("profiles").select("*").eq("id",uid).maybeSingle();
  if(error)throw error;
  if(!data){
    const payload={id:uid,full_name:name||session.user.user_metadata?.full_name||"کاربر ران‌فود",phone:phone||session.user.user_metadata?.phone||null,role:"customer"};
    const result=await supabase.from("profiles").insert(payload).select().single();
    if(result.error)throw new Error("ساخت پروفایل ناموفق بود: "+result.error.message);
    data=result.data;
  }
  profile=data;
}
async function enterApp(){ $("authView").classList.add("hidden");$("contentView").classList.remove("hidden");$("logoutBtn").classList.remove("hidden");$("manageNav").classList.toggle("hidden",!["super_admin","restaurant_manager","employee","courier"].includes(profile.role));$("welcomeText").textContent=`سلام ${profile.full_name||"دوست عزیز"}؛ نقش: ${roleName(profile.role)}`;showPage("home"); }
function roleName(r){return ({super_admin:"مدیر کل",restaurant_manager:"مدیر رستوران",employee:"کارمند",customer:"مشتری",courier:"پیک"})[r]||r;}
function showAuth(){$("contentView").classList.add("hidden");$("authView").classList.remove("hidden");$("logoutBtn").classList.add("hidden");}
function title(t){$("pageTitle").textContent=t;}
function money(v){return Number(v||0).toLocaleString("fa-IR")+" تومان";}
function safe(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function showPage(page){currentPage=page;const host=$("pageContent");host.innerHTML="";if(!profile)return;
  if(page==="home"){title("خانه");host.innerHTML=`<div class="grid"><div class="panel"><b>🍔 سفارش غذا</b><p>رستوران‌ها و منوها را ببین.</p><button class="small-btn" data-go="restaurants">مشاهده رستوران‌ها</button></div><div class="panel"><b>📦 سفارش‌های من</b><p>وضعیت سفارش‌ها را پیگیری کن.</p><button class="small-btn" data-go="orders">مشاهده سفارش‌ها</button></div><div class="panel"><b>👤 حساب کاربری</b><p>${safe(roleName(profile.role))}</p></div></div>`;host.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>showPage(b.dataset.go));}
  if(page==="restaurants")await renderRestaurants(host);
  if(page==="orders")await renderOrders(host);
  if(page==="account"){title("حساب کاربری");host.innerHTML=`<div class="panel"><h3>${safe(profile.full_name)}</h3><p>ایمیل: ${safe(session.user.email)}</p><p>شماره تماس: ${safe(profile.phone||"ثبت نشده")}</p><p>نقش: ${safe(roleName(profile.role))}</p></div>`;}
  if(page==="manage")await renderManage(host);
}
async function renderRestaurants(host){title("رستوران‌ها");const {data,error}=await supabase.from("restaurants").select("id,name,description,address").eq("active",true).order("name");if(error){host.innerHTML=`<div class="empty">${safe(error.message)}</div>`;return;}if(!data?.length){host.innerHTML='<div class="empty">فعلاً رستورانی ثبت نشده است.</div>';return;}
  host.innerHTML='<div class="grid">'+data.map(r=>`<article class="restaurant-card"><h3>${safe(r.name)}</h3><p>${safe(r.description||"")}</p><p>📍 ${safe(r.address||"آدرس ثبت نشده")}</p><button class="small-btn" data-id="${r.id}">دیدن شعبه‌ها</button></article>`).join("")+'</div>';
  host.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>renderBranches(host,b.dataset.id));
}
async function renderBranches(host,rid){const {data,error}=await supabase.from("branches").select("id,name,address").eq("restaurant_id",rid).eq("active",true);if(error){host.innerHTML=`<div class="empty">${safe(error.message)}</div>`;return;}host.innerHTML='<div class="section-head"><h2>شعبه‌ها</h2><button id="backRest" class="small-btn">بازگشت</button></div>'+(data?.length?'<div class="grid">'+data.map(x=>`<article class="restaurant-card"><h3>${safe(x.name)}</h3><p>${safe(x.address||"")}</p><button class="small-btn" data-branch="${x.id}">مشاهده منو</button></article>`).join("")+'</div>':'<div class="empty">شعبه فعالی وجود ندارد.</div>');$("backRest").onclick=()=>renderRestaurants(host);host.querySelectorAll("[data-branch]").forEach(b=>b.onclick=()=>renderMenu(host,b.dataset.branch));}
async function renderMenu(host,bid){const {data,error}=await supabase.from("menu_items").select("id,name,description,price,category").eq("branch_id",bid).eq("is_available",true).order("category");if(error){host.innerHTML=`<div class="empty">${safe(error.message)}</div>`;return;}host.innerHTML='<div class="section-head"><h2>منوی غذا</h2><button id="cartBtn" class="small-btn">سبد خرید ('+cart.length+')</button></div>'+(data?.length?'<div class="grid">'+data.map(x=>`<article class="food-card"><span class="eyebrow">${safe(x.category||"غذا")}</span><h3>${safe(x.name)}</h3><p>${safe(x.description||"")}</p><div class="row"><span class="price">${money(x.price)}</span><button class="small-btn" data-food="${x.id}" data-name="${safe(x.name)}" data-price="${x.price}">افزودن</button></div></article>`).join("")+'</div>':'<div class="empty">غذایی در این شعبه ثبت نشده است.</div>');$("cartBtn").onclick=()=>showCart(host,bid);host.querySelectorAll("[data-food]").forEach(b=>b.onclick=()=>{cart.push({id:b.dataset.food,name:b.dataset.name,price:Number(b.dataset.price)});$("cartBtn").textContent=`سبد خرید (${cart.length})`;});}
function showCart(host,bid){title("سبد خرید");if(!cart.length){host.innerHTML='<div class="empty">سبد خرید خالی است.</div>';return;}const total=cart.reduce((s,x)=>s+x.price,0);host.innerHTML='<div class="panel">'+cart.map((x,i)=>`<div class="row"><span>${safe(x.name)}</span><span>${money(x.price)} <button class="small-btn" data-remove="${i}">حذف</button></span></div>`).join("")+`<hr><div class="row"><b>جمع کل</b><b class="price">${money(total)}</b></div><button id="placeOrder" class="primary wide">ثبت سفارش با پرداخت در محل</button><p class="muted">پرداخت آنلاین در این نسخه فعال نیست.</p><p id="orderMsg" class="message"></p></div>`;host.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);showCart(host,bid);});$("placeOrder").onclick=async()=>{const items=cart.map(x=>({menu_item_id:x.id,quantity:1}));const {data,error}=await supabase.rpc("create_ranfood_order",{p_branch_id:bid,p_items:items});if(error){$("orderMsg").textContent=error.message;$("orderMsg").className="message error";return;}cart=[];$("orderMsg").textContent="سفارش ثبت شد. کد سفارش: "+data;$("orderMsg").className="message ok";};}
async function renderOrders(host){title("سفارش‌های من");let q=supabase.from("orders").select("id,total_price,status,payment_status,created_at").order("created_at",{ascending:false}).limit(50);if(profile.role==="customer")q=q.eq("customer_id",session.user.id);const {data,error}=await q;if(error){host.innerHTML=`<div class="empty">${safe(error.message)}</div>`;return;}host.innerHTML=data?.length?data.map(o=>`<div class="order"><div class="row"><b>سفارش ${safe(o.id.slice(0,8))}</b><span class="price">${money(o.total_price)}</span></div><p>وضعیت: ${safe(o.status||"در انتظار تأیید")} | ${safe(o.payment_status||"پرداخت در محل")}</p><small class="muted">${new Date(o.created_at).toLocaleString("fa-IR")}</small></div>`).join(""):'<div class="empty">هنوز سفارشی ثبت نکرده‌ای.</div>';}
async function renderManage(host){title("مدیریت");if(profile.role==="customer"){host.innerHTML='<div class="empty">دسترسی مدیریت برای حساب شما فعال نیست.</div>';return;}if(profile.role==="courier"){host.innerHTML='<div class="panel"><h3>پنل پیک</h3><p>برای مشاهده و تغییر سفارش‌های تخصیص‌یافته، سیاست‌های امن پیک باید در پایگاه داده فعال شوند.</p></div>';return;}
  if(profile.role==="employee"){host.innerHTML='<div class="panel"><h3>پنل کارمند</h3><p>دسترسی‌های کارمند از جدول restaurant_members و ستون permissions تعیین می‌شود. ابزارهای تغییر اطلاعات تا زمان تنظیم سیاست‌های اختصاصی غیرفعال‌اند.</p></div>';return;}
  let q=supabase.from("restaurants").select("id,name,description,address,active").order("created_at",{ascending:false});
  if(profile.role==="restaurant_manager"){const {data:mem}=await supabase.from("restaurant_members").select("restaurant_id").eq("user_id",session.user.id);const ids=(mem||[]).map(x=>x.restaurant_id);q=q.in("id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]);}
  const {data,error}=await q;if(error){host.innerHTML=`<div class="empty">${safe(error.message)}</div>`;return;}
  host.innerHTML=`<div class="panel"><h3>${profile.role==="super_admin"?"مدیریت همه رستوران‌ها":"رستوران‌های تحت مدیریت شما"}</h3><div class="form-grid"><input id="newRestName" placeholder="نام رستوران"><input id="newRestAddress" placeholder="آدرس"><input id="newRestDesc" placeholder="توضیحات"></div><button id="addRest" class="primary">ثبت رستوران</button><p id="manageMsg" class="message"></p></div>`+(data?.length?data.map(r=>`<div class="order"><b>${safe(r.name)}</b><p>${safe(r.address||"")}</p></div>`).join(""):'<div class="empty">رستورانی ثبت نشده است.</div>');
  $("addRest").onclick=async()=>{if(profile.role!=="super_admin"){$("manageMsg").textContent="ثبت رستوران جدید فقط برای مدیر کل مجاز است.";return;}const name=$("newRestName").value.trim();if(!name){$("manageMsg").textContent="نام رستوران را وارد کن.";return;}const {error}=await supabase.from("restaurants").insert({name,address:$("newRestAddress").value,description:$("newRestDesc").value});$("manageMsg").textContent=error?error.message:"رستوران ثبت شد؛ صفحه را تازه‌سازی کن.";$("manageMsg").className="message "+(error?"error":"ok");};
}
async function boot(){if(!configured){$("setupNotice").classList.remove("hidden");$("setupNotice").textContent="برای شروع، فایل config.js را باز کن و کلید عمومی جدید Supabase را جایگزین متن راهنما کن.";return;}const {data}=await supabase.auth.getSession();session=data.session;if(session){try{await ensureProfile();await enterApp();}catch(e){showAuth();msg(e.message,true);}}else showAuth();supabase.auth.onAuthStateChange(async(_event,s)=>{session=s;if(!s){profile=null;showAuth();}});}
boot();
