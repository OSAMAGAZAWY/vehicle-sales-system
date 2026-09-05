let TOKEN = localStorage.getItem('vs_token') || null;
let CURRENT_USER = null;

function money(n){return Number(n||0).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})+' ريال';}
function statusText(s){return {new:'بانتظار مشرف الفرع',manager:'بانتظار المحاسب',accounting:'مكتمل',rejected:'مرفوض / معاد للمندوب'}[s]||s}
function badge(s){let cls={new:'b-super',supervisor:'b-manager',manager:'b-account',accounting:'b-done',rejected:'b-reject'}[s]||'b-new';return `<span class="badge ${cls}">${statusText(s)}</span>`}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch('/api' + path, { ...options, headers });
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || 'حدث خطأ');
  return data;
}

async function apiUpload(path, formData) {
  const headers = {};
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch('/api' + path, { method: 'POST', headers, body: formData });
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || 'حدث خطأ');
  return data;
}

async function apiDownload(path, filename) {
  const headers = {};
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch('/api' + path, { headers });
  if (!res.ok) { alert('تعذّر تحميل الملف'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function showPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById(p).classList.add('active');
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', x.dataset.page === p));
  if (p === 'dashboard') loadDashboard();
  if (p === 'sales') loadSales();
  if (p === 'users') loadUsers();
  if (p === 'audit') loadAudit();
  if (p === 'inventory') loadInventory();
  if (p === 'settings') loadCompanySettings();
}
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => showPage(b.dataset.page));

function applyRoleVisibility() {
  const isRep = CURRENT_USER.role === 'sales_rep';
  const isAdmin = CURRENT_USER.role === 'admin';
  const isManager = CURRENT_USER.role === 'sales_manager';
  document.getElementById('navNewSale').style.display = isRep ? '' : 'none';
  document.getElementById('navUsers').style.display = isAdmin ? '' : 'none';
  document.getElementById('navInventory').style.display = isAdmin ? '' : 'none';
  document.getElementById('navAudit').style.display = (isAdmin || isManager) ? '' : 'none';
}

async function boot() {
  if (!TOKEN) return;
  try {
    const { user } = await api('/auth/me');
    CURRENT_USER = user;
    enterApp();
  } catch {
    TOKEN = null; localStorage.removeItem('vs_token');
  }
}

function enterApp() {
  document.getElementById('userbox').style.display = '';
  document.getElementById('sidebar').style.display = '';
  document.getElementById('userName').textContent = CURRENT_USER.name;
  document.getElementById('userRole').textContent = CURRENT_USER.roleLabel;
  applyRoleVisibility();
  showPage('dashboard');
}

document.getElementById('loginBtn').onclick = async () => {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
  errBox.style.display = 'none';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    TOKEN = data.token; CURRENT_USER = data.user;
    localStorage.setItem('vs_token', TOKEN);
    document.getElementById('login').classList.remove('active');
    enterApp();
  } catch (e) {
    errBox.textContent = e.message; errBox.style.display = '';
  }
};

document.getElementById('logoutBtn').onclick = () => {
  TOKEN = null; CURRENT_USER = null; localStorage.removeItem('vs_token');
  location.reload();
};

// ---------- لوحة التحكم ----------
async function loadDashboard() {
  const counts = await api('/sales/stats/summary');
  document.getElementById('stats').innerHTML = [
    ['إجمالي المبايعات', Object.values(counts).reduce((a,b)=>a+b,0)],
    ['بانتظار المشرف', counts.new],
    ['بانتظار المحاسب', counts.manager],
    ['مكتمل', counts.accounting],
    ['مرفوض', counts.rejected]
  ].map(x => `<div class="stat"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('');

  const sales = await api('/sales');
  document.getElementById('recent').innerHTML = sales.slice(0, 8).map(s =>
    `<tr><td>${s.sale_number}</td><td>${s.customer_name}</td><td>${s.make} ${s.model}</td><td>${money(s.gross)}</td><td>${badge(s.status)}</td></tr>`
  ).join('') || '<tr><td colspan="5">لا توجد مبايعات.</td></tr>';
}

// ---------- بحث VIN من مخزون السيارات ----------
let vinSearchTimer = null;
document.getElementById('vinSearch').oninput = (e) => {
  clearTimeout(vinSearchTimer);
  const q = e.target.value.trim();
  const box = document.getElementById('vinResults');
  if (q.length < 3) { box.innerHTML = ''; return; }
  vinSearchTimer = setTimeout(async () => {
    const results = await api('/vehicles/search?q=' + encodeURIComponent(q));
    box.innerHTML = results.map(v =>
      `<div class="card" style="padding:8px;margin-bottom:6px;cursor:pointer" onclick='fillVehicle(${JSON.stringify(v)})'>
        <b>${v.vin}</b> — ${v.make || ''} ${v.trim || ''} ${v.model || ''} ${v.year || ''} — ${v.color || ''}
      </div>`
    ).join('') || '<div class="muted">لا توجد نتائج مطابقة في المخزون.</div>';
  }, 350);
};

function fillVehicle(v) {
  const form = document.getElementById('saleForm');
  form.make.value = v.make || '';
  form.trim.value = v.trim || '';
  form.model.value = v.model || '';
  form.year.value = v.year || '';
  form.color.value = v.color || '';
  form.plate.value = v.plate || '';
  form.vin.value = v.vin || '';
  form.odometer.value = v.odometer || '';
  form.location.value = v.location || '';
  if (v.price) { document.getElementById('priceInput').value = v.price; updateRemaining(); }
  document.getElementById('vinResults').innerHTML = '';
  document.getElementById('vinSearch').value = '';
}

function updateRemaining() {
  const price = Number(document.getElementById('priceInput').value) || 0;
  const paid = Number(document.getElementById('paidInput').value) || 0;
  document.getElementById('remainingDisplay').value = Math.max(0, price - paid).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
document.getElementById('priceInput').oninput = updateRemaining;
document.getElementById('paidInput').oninput = updateRemaining;

// ---------- إنشاء مبايعة ----------
document.getElementById('saleForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const o = Object.fromEntries(f.entries());
  try {
    const sale = await api('/sales', { method: 'POST', body: JSON.stringify(o) });
    e.target.reset();
    document.getElementById('remainingDisplay').value = '0.00';
    document.getElementById('vinResults').innerHTML = '';
    alert('تم إنشاء العقد ' + sale.sale_number + ' وتحويله لمشرف الفرع.');
    openSale(sale.id);
  } catch (err) {
    alert(err.message);
  }
};

// ---------- قائمة المبايعات ----------
async function loadSales() {
  const q = document.getElementById('search').value || '';
  const sales = await api('/sales?q=' + encodeURIComponent(q));
  document.getElementById('salesTable').innerHTML = sales.map(s =>
    `<tr><td>${s.sale_number}</td><td>${s.customer_name}</td><td>${s.make} ${s.model}</td><td>${money(s.gross)}</td><td>${s.created_by_name}</td><td>${badge(s.status)}</td><td><button class="btn secondary" onclick="openSale(${s.id})">فتح</button></td></tr>`
  ).join('') || '<tr><td colspan="7">لا توجد نتائج.</td></tr>';
}
document.getElementById('search').oninput = loadSales;

// ---------- الاعتمادات ----------
async function openSale(id) {
  const s = await api('/sales/' + id);
  const approvalsHtml = s.approvals.map(a =>
    `<div class="muted">${a.stage} — ${a.action==='approve'?'اعتماد':'رفض'} بواسطة ${a.user_name} (${new Date(a.created_at).toLocaleString('ar-SA')})${a.note?' — '+a.note:''}</div>`
  ).join('');

  document.getElementById('approvalBox').innerHTML = `
  <div class="card" style="border:0;padding:0"><h2>${s.sale_number}</h2>
  <div class="grid"><div><b>العميل</b><br>${s.customer_name}</div><div><b>السيارة</b><br>${s.make} ${s.trim||''} ${s.model} - ${s.year||''}</div><div><b>VIN</b><br>${s.vin}</div><div><b>الإجمالي</b><br>${money(s.gross)}</div><div><b>المدفوع</b><br>${money(s.paid)}</div><div><b>المتبقي</b><br>${money(s.remaining)}</div></div>
  <div class="section-title">حالة الاعتماد</div>
  <p>${badge(s.status)}</p>
  ${s.reject_reason ? `<div class="notice"><b>سبب الإرجاع:</b> ${s.reject_reason}</div>` : ''}
  ${approvalsHtml}
  <div class="actions">
  <button class="btn secondary" onclick="printContract(${s.id})">طباعة عقد المبايعة</button>
  ${approvalButtons(s)}
  </div></div>`;
  showPage('approvals');
}

function approvalButtons(s) {
  const role = CURRENT_USER.role;
  if (role === 'sales_manager')
    return `<span class="muted">وضع مشاهدة إشرافي — مدير المبيعات لا يعتمد أو يرفض المبايعات.</span>`;
  if (role === 'branch_supervisor' && s.status === 'new')
    return `<button class="btn success" onclick="approve(${s.id})">اعتماد مشرف الفرع</button><button class="btn danger" onclick="reject(${s.id})">إرجاع للمندوب</button>`;
  if (role === 'accountant' && s.status === 'manager')
    return `<button class="btn success" onclick="approve(${s.id})">اعتماد مالي</button><button class="btn danger" onclick="reject(${s.id})">إرجاع للمراجعة</button>`;
  if (role === 'sales_rep' && s.status === 'rejected' && s.created_by === CURRENT_USER.id)
    return `<span class="muted">هذه المبايعة معادة إليك — عدّل بياناتها من قائمة المبايعات ثم أعد الإرسال.</span>`;
  return `<span class="muted">لا توجد صلاحية اعتماد لهذه المرحلة بالدور الحالي.</span>`;
}

async function approve(id) {
  try { await api(`/sales/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }); openSale(id); }
  catch (e) { alert(e.message); }
}
async function reject(id) {
  const reason = prompt('اكتب سبب الإرجاع للمندوب:');
  if (!reason) return;
  try { await api(`/sales/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); openSale(id); }
  catch (e) { alert(e.message); }
}

// ---------- طباعة العقد ----------
async function printContract(id) {
  const [s, company] = await Promise.all([api('/sales/' + id), api('/company')]);
  const posClause = s.payment_method === 'POS'
    ? `<div class="box"><b>بند السداد عبر نقاط البيع (POS):</b> إذا لم تصل قيمة العملية إلى حساب البائع أو عادت/ارتدت إلى حساب المشتري لأي سبب، يلتزم المشتري بسداد القيمة المستحقة للبائع خلال مدة أقصاها 48 ساعة من تاريخ ثبوت رجوع المبلغ إلى حسابه.</div>`
    : '';
  const supApproval = s.approvals.find(a => a.stage === 'supervisor' && a.action === 'approve');
  const accApproval = s.approvals.find(a => a.stage === 'accounting' && a.action === 'approve');

  document.getElementById('contractContent').innerHTML = `
  <div class="watermark">${company.company_name || ''}</div>
  <div class="letterhead">
    <div><div class="company-name">${company.company_name || ''}</div>
    <div class="company-meta">${company.address ? company.address + '<br>' : ''}${company.phone ? 'هاتف: ' + company.phone : ''}</div></div>
    <div class="contract-meta">${company.cr_number ? 'س.ت: ' + company.cr_number + '<br>' : ''}${company.tax_number ? 'الرقم الضريبي: ' + company.tax_number : ''}</div>
  </div>
  <h1>عقد مبايعة سيارة</h1>
  <p style="text-align:center">رقم العقد: <b>${s.sale_number}</b> — تاريخ الإنشاء: ${new Date(s.created_at).toLocaleDateString('ar-SA')}</p>
  <div class="box"><b>أولاً: أطراف العقد</b><br>البائع: <b>${company.company_name || ''}</b>${company.cr_number ? ' — س.ت: ' + company.cr_number : ''}<br>المشتري: <b>${s.customer_name}</b> — الهوية/الإقامة: <b>${s.customer_id}</b> — الجوال: <b>${s.customer_phone}</b><br>العنوان: ${s.customer_address || '................................................'}</div>
  <div class="box"><b>ثانياً: السيارة محل المبايعة</b>
  <table><tr><th>النوع</th><th>الفئة</th><th>الموديل</th><th>السنة</th></tr><tr><td>${s.make}</td><td>${s.trim||''}</td><td>${s.model}</td><td>${s.year||''}</td></tr>
  <tr><th>اللون</th><th>اللوحة</th><th>رقم الهيكل VIN</th><th>العداد</th></tr><tr><td>${s.color||''}</td><td>${s.plate||''}</td><td>${s.vin}</td><td>${s.odometer||''}</td></tr></table></div>
  <div class="box"><b>ثالثاً: قيمة المبايعة والسداد</b><br>
  إجمالي سعر البيع (شامل الضريبة ورسوم اللوحات): <b>${money(s.gross)}</b><br>
  العربون: ${money(s.deposit)} — المبلغ المدفوع: ${money(s.paid)} — <b>المبلغ المتبقي: ${money(s.remaining)}</b><br>
  طريقة السداد: ${s.payment_method}${s.financier?` — جهة التمويل: ${s.financier}`:''}</div>
  ${posClause}
  <div class="box"><b>رابعاً: الشروط</b>
  <ol>
  <li>يقر المشتري بأنه عاين السيارة واطلع على مواصفاتها وحالتها والملاحظات المثبتة في العقد وقبل شراءها وفق ما تم الاتفاق عليه، مع عدم الإخلال بالحقوق والضمانات التي يقررها النظام.</li>
  <li>العربون المدفوع من المشتري مسترد بالكامل في حال ثبوت عيب جوهري بالسيارة يحول دون إتمام البيع. أما في حال كان إلغاء الاتفاق بطلب من المشتري لأسباب أخرى، فيُرد العربون خلال مدة أقصاها 15 يوم عمل من تاريخ طلب الإلغاء.</li>
  <li>تقع مسؤولية الصيانة الدورية وتوفير قطع الغيار وما في حكمها على عاتق الوكيل المعتمد للسيارة، ولا يتحمل المعرض أي التزام بهذا الخصوص بعد تسليم السيارة للمشتري.</li>
  <li>يقر البائع بصحة بيانات السيارة وبصفته النظامية في بيعها، ويلتزم بالإفصاح عن أي رهن أو حجز أو مانع نظامي من نقل الملكية إن وجد.</li>
  <li>يلتزم الطرفان باستكمال إجراءات نقل الملكية والتسليم وفق المتطلبات النظامية، وتكون الرسوم والالتزامات بحسب الاتفاق المكتوب والأنظمة النافذة.</li>
  <li>أي ضمان إضافي يكون وفق وثيقة ضمان مكتوبة تحدد مدته ونطاقه واستثناءاته.</li>
  <li>في حال إخلال أي طرف بالتزام جوهري، يحق للطرف الآخر التمسك بالحقوق النظامية وطلب التنفيذ أو الفسخ والتعويض متى كان جائزاً نظاماً.</li>
  <li>يمثل هذا العقد كامل الاتفاق بين الطرفين بشأن السيارة محل المبايعة، وأي تعديل جوهري يجب أن يكون مثبتاً كتابةً.</li>
  <li>يخضع العقد للأنظمة المعمول بها في المملكة العربية السعودية، وتختص الجهة القضائية المختصة نظاماً بنظر أي نزاع.</li>
  </ol></div>
  <div class="box"><b>ملاحظات حالة السيارة</b><br>${s.condition_notes || 'لا توجد ملاحظات مدونة.'}<br>${s.notes || ''}</div>
  <div class="signgrid"><div><b>المشتري</b><br>الاسم: ${s.customer_name}<br><br>التوقيع: ____________________<br>التاريخ: ____________________</div><div><b>مندوب المبيعات</b><br>الاسم: ${s.created_by_name}${s.branch ? ' — الفرع: ' + s.branch : ''}<br><br>التوقيع: ____________________<br>التاريخ: ____________________</div>
  <div><b>مشرف الفرع</b><br>${supApproval ? `اعتمد بواسطة: ${supApproval.user_name}` : 'الاسم: ____________________'}<br><br>التوقيع: ____________________<br>التاريخ: ____________________</div></div>
  <div style="margin-top:35px"><b>المحاسب – الاعتماد المالي:</b> ${accApproval ? `اعتمد بواسطة: ${accApproval.user_name}` : '____________________'} &nbsp;&nbsp; التوقيع: ____________________ &nbsp;&nbsp; التاريخ: ____________________</div>
  `;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('printContract').classList.add('active');
  setTimeout(() => window.print(), 300);
}

// ---------- إدارة المستخدمين ----------
async function loadUsers() {
  const users = await api('/users');
  const roleLabels = { admin:'مدير نظام', sales_rep:'مندوب مبيعات', branch_supervisor:'مشرف فرع', sales_manager:'مدير مبيعات', accountant:'محاسب' };
  document.getElementById('usersTable').innerHTML = users.map(u => `
    <tr><td>${u.name}</td><td>${u.username}</td><td>${roleLabels[u.role]||u.role}</td><td>${u.branch||''}</td>
    <td>${u.active ? '<span class="badge b-done">مفعّل</span>' : '<span class="badge b-reject">معطّل</span>'}</td>
    <td><button class="btn secondary" onclick="toggleUser(${u.id}, ${!u.active})">${u.active?'تعطيل':'تفعيل'}</button>
    <button class="btn secondary" onclick="resetUserPw(${u.id})">إعادة تعيين كلمة المرور</button></td></tr>
  `).join('');
}
document.getElementById('addUserBtn').onclick = async (e) => {
  e.preventDefault();
  const f = new FormData(document.getElementById('userForm'));
  const o = Object.fromEntries(f.entries());
  try {
    await api('/users', { method: 'POST', body: JSON.stringify(o) });
    document.getElementById('userForm').reset();
    loadUsers();
  } catch (err) { alert(err.message); }
};
async function toggleUser(id, active) {
  await api(`/users/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) });
  loadUsers();
}
async function resetUserPw(id) {
  const pw = prompt('أدخل كلمة المرور الجديدة (٨ أحرف فأكثر):');
  if (!pw) return;
  try { await api(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword: pw }) }); alert('تم التحديث'); }
  catch (e) { alert(e.message); }
}

// ---------- سجل التدقيق ----------
async function loadAudit() {
  const logs = await api('/audit');
  document.getElementById('auditTable').innerHTML = logs.map(l => `
    <tr><td>${new Date(l.created_at).toLocaleString('ar-SA')}</td><td>${l.user_name||'—'}</td><td>${l.action}</td><td>${l.sale_id||''}</td><td>${l.details?JSON.stringify(l.details):''}</td></tr>
  `).join('');
}

// ---------- بيانات المنشأة (مدير النظام فقط) ----------
async function loadCompanySettings() {
  if (CURRENT_USER.role !== 'admin') { document.getElementById('companyCard').style.display = 'none'; return; }
  document.getElementById('companyCard').style.display = '';
  const company = await api('/company');
  const form = document.getElementById('companyForm');
  form.company_name.value = company.company_name || '';
  form.cr_number.value = company.cr_number || '';
  form.tax_number.value = company.tax_number || '';
  form.address.value = company.address || '';
  form.phone.value = company.phone || '';
}
document.getElementById('saveCompanyBtn').onclick = async (e) => {
  e.preventDefault();
  const f = new FormData(document.getElementById('companyForm'));
  const o = Object.fromEntries(f.entries());
  try {
    await api('/company', { method: 'PATCH', body: JSON.stringify(o) });
    alert('تم حفظ بيانات المنشأة');
  } catch (err) { alert(err.message); }
};

// ---------- مخزون السيارات (مدير النظام فقط) ----------
async function loadInventory() {
  const vehicles = await api('/vehicles');
  document.getElementById('vehiclesTable').innerHTML = vehicles.map(v => `
    <tr><td>${v.vin}</td><td>${v.make||''}</td><td>${v.model||''}</td><td>${v.year||''}</td><td>${v.color||''}</td><td>${money(v.price)}</td><td>${new Date(v.updated_at).toLocaleDateString('ar-SA')}</td></tr>
  `).join('') || '<tr><td colspan="7">المخزون فارغ حالياً — ارفع ملف Excel لإضافة السيارات.</td></tr>';
}
document.getElementById('downloadTemplateBtn').onclick = () => apiDownload('/vehicles/template', 'vehicles_template.xlsx');
document.getElementById('uploadVehiclesBtn').onclick = () => document.getElementById('vehicleFileInput').click();
document.getElementById('vehicleFileInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const resultBox = document.getElementById('importResult');
  try {
    const result = await apiUpload('/vehicles/import', fd);
    resultBox.style.display = '';
    resultBox.textContent = `تم استيراد ${result.inserted} سيارة بنجاح من أصل ${result.total} صف (تم تجاهل ${result.skipped} صف بلا رقم هيكل).`;
    loadInventory();
  } catch (err) {
    resultBox.style.display = '';
    resultBox.textContent = 'خطأ: ' + err.message;
  }
  e.target.value = '';
};

// ---------- تغيير كلمة المرور ----------
document.getElementById('changePwBtn').onclick = async () => {
  const oldPassword = prompt('كلمة المرور الحالية:');
  if (!oldPassword) return;
  const newPassword = prompt('كلمة المرور الجديدة (٨ أحرف فأكثر):');
  if (!newPassword) return;
  try {
    await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
    alert('تم تغيير كلمة المرور بنجاح');
  } catch (e) { alert(e.message); }
};

boot();
