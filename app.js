/* ---------------- Supabase Credentials Setup ---------------- */
const SUPABASE_URL = "https://ypdzkmjdpjqjkhplnfgd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hHW0L04cexjhsUHLKu_QjA_o41djmit";

let supabaseClient;

try {
  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.innerHTML = '<div style="padding:40px; text-align:center; color:red;"><h3>Failed to load Supabase SDK.</h3></div>';
    }
  }
} catch (e) {
  console.error("Initialization Error:", e);
}

/* ---------------- Config ---------------- */
const ROLES = [
  { id: "PI", label: "Principal Investigator", canCreateStudy: true, canDelegate: true, canApprove: true, readOnly: false },
  { id: "SUBI", label: "Sub-Investigator", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: false },
  { id: "CRC", label: "Clinical Research Coordinator", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: false },
  { id: "PHARM", label: "Pharmacist", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: false },
  { id: "NURSE", label: "Study Nurse", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: false },
  { id: "QA", label: "Quality Assurance", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: true },
  { id: "MONITOR", label: "Monitor", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: true },
  { id: "SPONSOR", label: "Sponsor", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: true },
  { id: "ADMIN", label: "Administrator", canCreateStudy: true, canDelegate: true, canApprove: true, readOnly: false }
];

function getRole(id) {
  return ROLES.find(r => r.id === id) || ROLES[2];
}

/* ---------------- Application State ---------------- */
let state = { studies: [], entries: [], auditLog: [], users: [] };
let currentUser = null;
let screen = "login";
let authMode = "login";
let activeStudyId = null;
let dashSearch = "";
let dashStatusFilter = "all";

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

/* ---------------- Database & Auth API Layer ---------------- */
async function loadAllData() {
  if (!supabaseClient) return;
  const appEl = document.getElementById('app');

  try {
    const { data: { session }, error: authErr } = await supabaseClient.auth.getSession();
    if (authErr) throw authErr;

    if (session && session.user) {
      const u = session.user;
      currentUser = {
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || u.email,
        roleId: u.user_metadata?.role_id || "PI"
      };
      screen = "dashboard";
    } else {
      currentUser = null;
      screen = "login";
    }

    const { data: studies } = await supabaseClient.from('studies').select('*');
    state.studies = studies || [];

    const { data: logs } = await supabaseClient.from('audit_log').select('*').order('created_at', { ascending: false });
    state.auditLog = logs || [];

    const { data: usersData } = await supabaseClient.from('users').select('*');
    if (usersData && usersData.length > 0) {
      state.users = usersData;
    } else if (currentUser) {
      // عرض المستخدم الحالي في الجدول مؤقتاً لو جدول الـ users في الداتابيز فاضي
      state.users = [{
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role_id: currentUser.roleId,
        created_at: new Date().toISOString()
      }];
    } else {
      state.users = [];
    }

    render();
  } catch (e) {
    console.error("Database connection failure:", e);
    if (appEl) {
      appEl.innerHTML = '<div style="padding:40px; text-align:center; color:#A8402F;"><h3>Database Connection Issue</h3><p>' + escapeHtml(e.message || '') + '</p></div>';
    }
  }
}

async function loadStudyEntries(studyId) {
  const { data: entries } = await supabaseClient.from('delegation_entries').select('*').eq('study_id', studyId);
  state.entries = entries || [];
}

/* ---------------- UI Render Engines ---------------- */
function render() {
  const app = document.getElementById('app');
  if (!app) return;
  
  if (screen === 'login') {
    app.innerHTML = loginHtml();
    bindLogin();
  } else if (screen === 'dashboard') {
    app.innerHTML = topbarHtml() + dashboardHtml();
    bindTopbar();
    bindDashboard();
  } else if (screen === 'study') {
    app.innerHTML = topbarHtml() + studyHtml();
    bindTopbar();
    bindStudy();
  } else if (screen === 'admin') {
    app.innerHTML = topbarHtml() + adminHtml();
    bindTopbar();
    bindAdmin();
  }
}

/* ---------------- Auth Module ---------------- */
function loginHtml() {
  let options = '';
  for (let i = 0; i < ROLES.length; i++) {
    options += '<option value="' + ROLES[i].id + '">' + ROLES[i].label + '</option>';
  }
  const isReg = authMode === 'register';

  let html = '<div class="wrap"><div class="login-screen">';
  html += '<div class="kicker">Delegation of Authority System</div>';
  html += '<h1>' + (isReg ? 'Create Account' : 'Sign In') + '</h1>';
  html += '<div class="sub">Clinical Bioequivalence Center Portal</div>';
  
  html += '<div class="auth-tabs">';
  html += '<button class="auth-tab ' + (!isReg ? 'active' : '') + '" id="tab-login" type="button">Sign In</button>';
  html += '<button class="auth-tab ' + (isReg ? 'active' : '') + '" id="tab-register" type="button">Register</button>';
  html += '</div>';

  if (isReg) {
    html += '<div class="field" style="margin-bottom:14px;"><label>Full Name</label><input id="auth-name" placeholder="e.g. Dr. Mona Farid"></div>';
  }
  
  html += '<div class="field" style="margin-bottom:14px;"><label>Email Address</label><input id="auth-email" type="email" placeholder="name@center.com"></div>';
  html += '<div class="field" style="margin-bottom:14px;"><label>Password</label><input id="auth-pass" type="password" placeholder="••••••••"></div>';
  
  if (isReg) {
    html += '<div class="field" style="margin-bottom:20px;"><label>Role</label><select id="auth-role">' + options + '</select></div>';
  }

  html += '<button class="btn" id="auth-submit" type="button" style="width:100%; margin-top:10px;">' + (isReg ? 'Register Account' : 'Sign In') + '</button>';
  html += '</div></div>';
  return html;
}

function bindLogin() {
  document.getElementById('tab-login')?.addEventListener('click', () => { authMode = 'login'; render(); });
  document.getElementById('tab-register')?.addEventListener('click', () => { authMode = 'register'; render(); });

  document.getElementById('auth-submit')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-pass').value.trim();

    if (!email || !password) { alert('Please enter both email and password.'); return; }

    if (authMode === 'register') {
      const name = document.getElementById('auth-name').value.trim();
      const roleId = document.getElementById('auth-role').value;
      if (!name) { alert('Full name is required.'); return; }

      const { error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name, role_id: roleId } }
      });

      if (error) {
        alert("Registration failed: " + error.message);
      } else {
        await supabaseClient.from('users').insert([{ name: name, email: email, role_id: roleId }]);
        alert("Registration successful! You can now sign in.");
        authMode = 'login';
        render();
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (error) {
        alert("Sign in failed: " + error.message);
      } else {
        await loadAllData();
      }
    }
  });
}

/* ---------------- Topbar Module ---------------- */
function topbarHtml() {
  const role = getRole(currentUser.roleId);
  const isAdminOrPi = currentUser.roleId === 'ADMIN' || currentUser.roleId === 'PI';

  let html = '<div class="wrap" style="padding-bottom:0;"><div class="topbar">';
  html += '<div><div class="kicker">Delegation of Authority System</div><h1 style="font-size:22px;">Bioequivalence Center</h1></div>';
  html += '<div style="display:flex;align-items:center;gap:12px; flex-wrap:wrap;">';
  html += '<div class="who">Signed in as <b>' + escapeHtml(currentUser.name) + '</b> (' + escapeHtml(currentUser.email) + ')</div>';
  html += '<span class="role-badge">' + role.label + '</span>';
  if (isAdminOrPi) {
    html += '<button class="btn ghost small" id="goToAdminBtn" type="button">⚙️ Admin Dashboard</button>';
  }
  html += '<button class="btn ghost small no-print" id="signOutBtn" type="button">Sign Out</button>';
  html += '</div></div></div>';
  return html;
}

function bindTopbar() {
  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    currentUser = null;
    screen = 'login';
    render();
  });
  document.getElementById('goToAdminBtn')?.addEventListener('click', () => {
    screen = 'admin';
    render();
  });
}

/* ---------------- Admin Dashboard Module ---------------- */
function adminHtml() {
  let userRows = '';
  if (state.users.length === 0) {
    userRows = '<tr><td colspan="5" class="empty-state">No users found.</td></tr>';
  } else {
    for (let i = 0; i < state.users.length; i++) {
      let u = state.users[i];
      userRows += '<tr><td>' + escapeHtml(u.name || '—') + '</td><td>' + escapeHtml(u.email || '—') + '</td><td>';
      userRows += '<select class="admin-role-select" data-userid="' + u.id + '" style="padding:4px 8px; border-radius:4px; border:1px solid #ccc;">';
      for (let j = 0; j < ROLES.length; j++) {
        let r = ROLES[j];
        let sel = (u.role_id === r.id || u.role === r.id) ? 'selected' : '';
        userRows += '<option value="' + r.id + '" ' + sel + '>' + r.label + '</option>';
      }
      userRows += '</select></td><td>' + fmtDate(u.created_at) + '</td>';
      userRows += '<td><button class="btn ghost small save-role-btn" data-userid="' + u.id + '" type="button" style="color:#004D40; border-color:#004D40;">Update</button></td></tr>';
    }
  }

  let html = '<div class="wrap"><div class="study-header">';
  html += '<button class="back-link no-print" id="backToDashFromAdmin" type="button">← Back to Studies</button>';
  html += '<h1>System Admin Control Center</h1>';
  html += '<div class="grid"><div><b>' + state.studies.length + '</b>Total Studies</div><div><b>' + state.users.length + '</b>Users</div><div><b>' + state.auditLog.length + '</b>Audit Events</div></div>';
  html += '</div>';
  html += '<div class="section-head" style="margin-top:20px;"><h2>User Role Management</h2></div>';
  html += '<table class="roster" style="margin-bottom:30px;"><thead><tr><th>Name</th><th>Email</th><th>Change Role</th><th>Joined</th><th>Action</th></tr></thead><tbody>' + userRows + '</tbody></table>';
  html += '</div>';
  return html;
}

function bindAdmin() {
  document.getElementById('backToDashFromAdmin')?.addEventListener('click', () => {
    screen = 'dashboard';
    render();
  });

  document.querySelectorAll('.save-role-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.getAttribute('data-userid');
      const selectEl = document.querySelector('.admin-role-select[data-userid="' + userId + '"]');
      const newRole = selectEl ? selectEl.value : 'CRC';

      const { error } = await supabaseClient.from('users').update({ role_id: newRole }).eq('id', userId);
      if (error) {
        alert("Failed to update role: " + error.message);
      } else {
        alert("Role updated successfully!");
        loadAllData();
      }
    });
  });
}

/* ---------------- Dashboard Module ---------------- */
function dashboardHtml() {
  const role = getRole(currentUser.roleId);
  let studies = state.studies.filter(s => {
    const q = dashSearch.toLowerCase();
    const matchQ = !q || [s.title, s.protocol, s.sponsor, s.pi].some(v => (v || '').toLowerCase().includes(q));
    const matchStatus = dashStatusFilter === 'all' || (s.status || 'Planning') === dashStatusFilter;
    return matchQ && matchStatus;
  });

  let cards = '';
  for (let i = 0; i < studies.length; i++) {
    let s = studies[i];
    cards += '<div class="study-card study-card-click" data-studyid="' + s.id + '">';
    cards += '<div class="top-row"><span class="proto-chip">' + escapeHtml(s.protocol || 'NO CODE') + '</span>';
    cards += '<span class="status-pill status-' + (s.status === 'Active' ? 'active' : 'pending') + '">' + escapeHtml(s.status || 'Planning') + '</span></div>';
    cards += '<h3 style="margin-top:8px;">' + escapeHtml(s.title) + '</h3>';
    cards += '<div class="meta"><div><b>Sponsor:</b> ' + escapeHtml(s.sponsor || '—') + '</div><div><b>PI:</b> ' + escapeHtml(s.pi || '—') + '</div></div></div>';
  }

  let html = '<div class="wrap"><div class="section-head"><h2>Studies <span class="count">(' + studies.length + ')</span></h2>';
  html += '<div class="toolbar no-print">' + (role.canCreateStudy ? '<button class="btn" id="newStudyBtn" type="button">+ New Study</button>' : '') + '</div></div>';
  html += '<div class="dash-toolbar no-print"><input id="dashSearchInput" placeholder="Search studies..." value="' + escapeHtml(dashSearch) + '"></div>';
  html += (studies.length === 0 ? '<div class="empty-state">No studies found.</div>' : '<div class="study-grid">' + cards + '</div>') + '</div>';
  return html;
}

function bindDashboard() {
  const role = getRole(currentUser.roleId);
  document.getElementById('dashSearchInput')?.addEventListener('input', e => { dashSearch = e.target.value; render(); });
  
  if (role.canCreateStudy) {
    document.getElementById('newStudyBtn')?.addEventListener('click', openNewStudyModal);
  }

  document.querySelectorAll('.study-card-click').forEach(card => {
    card.addEventListener('click', async () => {
      const id = card.getAttribute('data-studyid');
      activeStudyId = id;
      await loadStudyEntries(id);
      screen = 'study';
      render();
    });
  });
}

function openNewStudyModal() {
  const div = document.createElement('div');
  div.id = 'modalRoot';
  document.body.appendChild(div);
  div.innerHTML = '<div class="overlay"><div class="modal"><h3>New Study</h3><div class="field"><label>Title</label><input id="ns-title"></div><div class="field"><label>Protocol</label><input id="ns-protocol"></div><div class="modal-actions"><button class="btn secondary" id="ns-cancel" type="button">Cancel</button><button class="btn" id="ns-save" type="button">Save</button></div></div></div>';

  document.getElementById('ns-cancel').addEventListener('click', () => div.remove());
  document.getElementById('ns-save').addEventListener('click', async () => {
    const title = document.getElementById('ns-title').value.trim();
    if (!title) { alert('Title required'); return; }
    const { data } = await supabaseClient.from('studies').insert([{ title: title, protocol: document.getElementById('ns-protocol').value.trim() }]).select();
    if (data) {
      state.studies.push(data[0]);
      div.remove();
      render();
    }
  });
}

/* ---------------- Study Details View ---------------- */
function studyHtml() {
  const study = state.studies.find(s => s.id === activeStudyId);
  if (!study) return '<div class="wrap"><div class="empty-state">Study not found.</div></div>';

  let rows = '';
  for (let i = 0; i < state.entries.length; i++) {
    let entry = state.entries[i];
    rows += '<tr><td>' + escapeHtml(entry.name) + '</td><td>' + escapeHtml(entry.role) + '</td><td>' + fmtDate(entry.start_date) + '</td></tr>';
  }

  let html = '<div class="wrap"><div class="study-header"><button class="back-link" id="backToDashBtn" type="button">← Back</button>';
  html += '<h1>' + escapeHtml(study.title) + '</h1></div>';
  html + '<div class="section-head"><h2>Team Roster</h2></div>';
  html += '<table class="roster"><thead><tr><th>Name</th><th>Role</th><th>Period</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3">No team members.</td></tr>') + '</tbody></table></div>';
  return html;
}

function bindStudy() {
  document.getElementById('backToDashBtn')?.addEventListener('click', () => {
    activeStudyId = null;
    screen = 'dashboard';
    render();
  });
}

// Initial Boot Loader
loadAllData();