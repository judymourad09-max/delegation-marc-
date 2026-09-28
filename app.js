/* ---------------- Supabase Credentials Setup ---------------- */
const SUPABASE_URL = "https://ypdzkmjdpjqjkhplnfgd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hHW0L04cexjhsUHLKu_QjA_o41djmit";

let supabaseClient;

try {
  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    document.getElementById('app').innerHTML = '<div style="padding:40px; text-align:center; color:red;"><h3>Failed to load Supabase SDK.</h3></div>';
  }
} catch (e) {
  console.error("Initialization Error:", e);
}

/* ---------------- Config ---------------- */
const RESPONSIBILITIES = [
  "Obtaining Informed Consent", "Medical History & Physical Exam", "Eligibility Screening (I/E criteria)",
  "IP (Study Drug) Administration", "PK Blood Sample Collection", "Sample Processing, Labeling & Storage",
  "Vital Signs / Safety Monitoring", "AE / SAE Assessment & Reporting", "Source Document Completion",
  "CRF / eCRF Completion", "IP Accountability & Storage", "Randomization Code Access",
  "Bioanalytical Sample Analysis", "Protocol Deviation Reporting", "Data Management / Entry", "QA / QC Review"
];

const ROLES = [
  { id: "PI", label: "Principal Investigator", canCreateStudy: true, canDelegate: true, canApprove: true, readOnly: false },
  { id: "SUBI", label: "Sub-Investigator", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: false },
  { id: "CRC", label: "Clinical Research Coordinator", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: false },
  { id: "PHARM", label: "Pharmacist", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: false },
  { id: "NURSE", label: "Study Nurse", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: false },
  { id: "QA", label: "Quality Assurance", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: true },
  { id: "MONITOR", label: "Monitor", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: true },
  { id: "SPONSOR", label: "Sponsor", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: true },
  { id: "ADMIN", label: "Administrator", canCreateStudy: true, canDelegate: true, canApprove: true, readOnly: false },
];

function getRole(id) { return ROLES.find(r => r.id === id) || ROLES[2]; }

/* ---------------- Application State ---------------- */
let state = { studies: [], entries: [], auditLog: [], users: [] };
let currentUser = null;
let screen = "login";
let authMode = "login";
let activeStudyId = null;
let dashSearch = "";
let dashStatusFilter = "all";
let dashSort = "newest";
let auditOpen = true;

function nowIso() { return new Date().toISOString(); }
function fmtTime(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleString(); }
function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString(); }
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str == null ? '' : str; return d.innerHTML; }

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
        roleId: u.user_metadata?.role_id || "CRC",
        savedSignature: u.user_metadata?.saved_signature || localStorage.getItem('sig_' + u.id) || null
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
    state.users = usersData || [];

    render();
  } catch (e) {
    console.error("Database connection failure:", e);
    if (appEl) {
      appEl.innerHTML = '<div style="padding:40px; text-align:center; color:#A8402F;"><h3>Database Connection Issue</h3><p>' + (e.message || '') + '</p></div>';
    }
  }
}

async function loadStudyEntries(studyId) {
  const { data: entries } = await supabaseClient.from('delegation_entries').select('*').eq('study_id', studyId);
  state.entries = entries || [];
}

async function logAudit(studyId, action, detail) {
  const role = currentUser ? getRole(currentUser.roleId) : null;
  const newLog = {
    study_id: studyId || null,
    user_name: currentUser ? currentUser.name : "System User",
    user_role: role ? role.label : "—",
    action: action,
    detail: detail
  };

  const { data } = await supabaseClient.from('audit_log').insert([newLog]).select();
  if (data && data.length > 0) {
    state.auditLog.unshift(data[0]);
    render();
  }
}

/* ---------------- UI Render Engines ---------------- */
function render() {
  const app = document.getElementById('app');
  if (!app) return;
  
  if (screen === 'login') { app.innerHTML = loginHtml(); bindLogin(); return; }
  if (screen === 'dashboard') { app.innerHTML = topbarHtml() + dashboardHtml(); bindTopbar(); bindDashboard(); return; }
  if (screen === 'study') { app.innerHTML = topbarHtml() + studyHtml(); bindTopbar(); bindStudy(); return; }
  if (screen === 'admin') { app.innerHTML = topbarHtml() + adminHtml(); bindTopbar(); bindAdmin(); return; }
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
  html += '<button class="auth-tab ' + (!isReg ? 'active' : '') + '" id="tab-login">Sign In</button>';
  html += '<button class="auth-tab ' + (isReg ? 'active' : '') + '" id="tab-register">Register</button>';
  html += '</div>';

  if (isReg) {
    html += '<div class="field" style="margin-bottom:14px;"><label>Full Name</label><input id="auth-name" placeholder="e.g. Dr. Mona Farid"></div>';
  }
  
  html += '<div class="field" style="margin-bottom:14px;"><label>Email Address</label><input id="auth-email" type="email" placeholder="name@center.com"></div>';
  html += '<div class="field" style="margin-bottom:14px;"><label>Password</label><input id="auth-pass" type="password" placeholder="••••••••"></div>';
  
  if (isReg) {
    html += '<div class="field" style="margin-bottom:20px;"><label>Role</label><select id="auth-role">' + options + '</select></div>';
  }

  html += '<button class="btn" id="auth-submit" style="width:100%; margin-top:10px;">' + (isReg ? 'Register Account' : 'Sign In') + '</button>';
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
    html += '<button class="btn ghost small" id="goToAdminBtn">⚙️ Admin Dashboard</button>';
  }
  html += '<button class="btn ghost small no-print" id="signOutBtn">Sign Out</button>';
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
      userRows += '<td><button class="btn ghost small save-role-btn" data-userid="' + u.id + '" style="color:#004D40; border-color:#004D40;">Update Role</button></td></tr>';
    }
  }

  let html = '<div class="wrap"><div class="study-header">';
  html += '<button class="back-link no-print" onclick="backToDashboard()">← Back to Studies</button>';
  html += '<h1>System Admin Control Center</h1>';
  html += '<div class="grid"><div><b>' + state.studies.length + '</b>Total Studies</div><div><b>' + state.users.length + '</b>Users</div><div><b>' + state.auditLog.length + '</b>Audit Events</div></div>';
  html += '</div>';
  html += '<div class="section-head" style="margin-top:20px;"><h2>User Role Management</h2></div>';
  html += '<table class="roster" style="margin-bottom:30px;"><thead><tr><th>Name</th><th>Email</th><th>Change Role</th><th>Joined</th><th>Action</th></tr></thead><tbody>' + userRows + '</tbody></table>';
  html += '</div>';
  return html;
}

function bindAdmin() {
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
    cards += '<div class="study-card" onclick="openStudy(\'' + s.id + '\')">';
    cards += '<div class="top-row"><span class="proto-chip">' + escapeHtml(s.protocol || 'NO CODE') + '</span>';
    cards += '<span class="status-pill status-' + (s.status === 'Active' ? 'active' : 'pending') + '">' + escapeHtml(s.status || 'Planning') + '</span></div>';
    cards += '<h3 style="margin-top:8px;">' + escapeHtml(s.title) + '</h3>';
    cards += '<div class="meta"><div><b>Sponsor:</b> ' + escapeHtml(s.sponsor || '—') + '</div><div><b>PI:</b> ' + escapeHtml(s.pi || '—') + '</div></div></div>';
  }

  let html = '<div class="wrap"><div class="section-head"><h2>Studies <span class="count">(' + studies.length + ')</span></h2>';
  html += '<div class="toolbar no-print">' + (role.canCreateStudy ? '<button class="btn" id="newStudyBtn">+ New Study</button>' : '') + '</div></div>';
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
}

function openNewStudyModal() {
  const div = document.createElement('div'); div.id = 'modalRoot';
  document.body.appendChild(div);
  div.innerHTML = '<div class="overlay"><div class="modal"><h3>New Study</h3><div class="field"><label>Title</label><input id="ns-title"></div><div class="field"><label>Protocol</label><input id="ns-protocol"></div><div class="modal-actions"><button class="btn secondary" id="ns-cancel">Cancel</button><button class="btn" id="ns-save">Save</button></div></div></div>';

  document.getElementById('ns-cancel').addEventListener('click', () => div.remove());
  document.getElementById('ns-save').addEventListener('click', async () => {
    const title = document.getElementById('ns-title').value.trim();
    if (!title) { alert('Title required'); return; }
    const { data } = await supabaseClient.from('studies').insert([{ title: title, protocol: document.getElementById('ns-protocol').value.trim() }]).select();
    if (data) { state.studies.push(data[0]); div.remove(); render(); }
  });
}

async function openStudy(id) {
  activeStudyId = id;
  await loadStudyEntries(id);
  screen = 'study';
  render();
}

function backToDashboard() { activeStudyId = null; screen = 'dashboard'; render(); }
function closeModal() { document.getElementById('modalRoot')?.remove(); }

/* ---------------- Study Details View ---------------- */
function currentStudy() { return state.studies.find(s => s.id === activeStudyId); }

function computeStatus(entry) {
  if (entry.deactivated) return 'inactive';
  if (entry.end_date && new Date(entry.end_date) < new Date()) return 'inactive';
  if (entry.signature_name && entry.pi_approval_name) return 'active';
  return 'pending';
}

function studyHtml() {
  const study = currentStudy();
  const role = getRole(currentUser.roleId);
  if (!study) return '<div class="wrap"><div class="empty-state">Study not found.</div></div>';

  let rows = '';
  if (state.entries.length === 0) {
    rows = '<tr><td colspan="9" class="empty-state">No team members delegated yet.</td></tr>';
  } else {
    for (let i = 0; i < state.entries.length; i++) {
      let entry = state.entries[i];
      let status = computeStatus(entry);
      let statusLabel = status === 'active' ? 'Active' : status === 'pending' ? 'Pending Signatures' : 'Inactive';

      let sigHtml = entry.signature_name
        ? '<div class="sig-block"><span class="sig-stamp">DIGITALLY SIGNED</span><br>' + (entry.signature_img ? '<img src="' + entry.signature_img + '" style="max-height:45px; margin:4px 0; border-bottom:1px dashed #004D40;"><br>' : '') + '<b>' + escapeHtml(entry.signature_name) + '</b><br><span class="sig-time">' + fmtTime(entry.signature_timestamp) + '</span></div>'
        : '<span class="sig-empty">Awaiting staff signature</span>';

      let piHtml = entry.pi_approval_name
        ? '<div class="sig-block"><span class="sig-stamp">PI APPROVED</span><br>' + (entry.pi_approval_img ? '<img src="' + entry.pi_approval_img + '" style="max-height:45px; margin:4px 0; border-bottom:1px dashed #004D40;"><br>' : '') + '<b>' + escapeHtml(entry.pi_approval_name) + '</b><br><span class="sig-time">' + fmtTime(entry.pi_approval_timestamp) + '</span></div>'
        : '<span class="sig-empty">Awaiting PI approval</span>';

      let canStaffSign = !entry.signature_name && !role.readOnly;
      let canPiApprove = entry.signature_name && !entry.pi_approval_name && role.canApprove;
      let canEnd = !entry.deactivated && role.canDelegate;

      let respList = [];
      if (Array.isArray(entry.responsibilities)) {
        respList = entry.responsibilities;
      } else if (typeof entry.responsibilities === 'string') {
        try { respList = JSON.parse(entry.responsibilities); } catch(e) { respList = [entry.responsibilities]; }
      }

      let tagsHtml = '';
      for (let k = 0; k < respList.length; k++) {
        tagsHtml += '<span class="tag">' + escapeHtml(respList[k]) + '</span>';
      }

      rows += '<tr>';
      rows += '<td>' + escapeHtml(entry.name) + '</td>';
      rows += '<td>' + escapeHtml(entry.role) + '</td>';
      rows += '<td><div class="tags">' + tagsHtml + '</div></td>';
      rows += '<td>' + fmtDate(entry.start_date) + ' → ' + (entry.end_date ? fmtDate(entry.end_date) : 'ongoing') + '</td>';
      rows += '<td>' + (entry.training_date ? 'Trained ' + fmtDate(entry.training_date) : '—') + '<br>' + (entry.cv_on_file ? 'CV on file' : 'CV pending') + '</td>';
      rows += '<td>' + sigHtml + '</td>';
      rows += '<td>' + piHtml + '</td>';
      rows += '<td><span class="status-pill status-' + status + '">' + statusLabel + '</span></td>';
      rows += '<td class="no-print"><div class="row-actions">';
      if (canStaffSign) rows += '<button class="btn ghost small" onclick="openCanvasModal(\'' + entry.id + '\',\'staff\')">✍️ E-Sign Staff</button>';
      if (canPiApprove) rows += '<button class="btn ghost small" onclick="openCanvasModal(\'' + entry.id + '\',\'pi\')">✍️ E-Sign PI</button>';
      if (canEnd) rows += '<button class="btn ghost small" onclick="endDelegation(\'' + entry.id + '\')">End</button>';
      rows += '</div></td></tr>';
    }
  }

  let studyAudit = state.auditLog.filter(a => String(a.study_id) === String(activeStudyId) || !a.study_id);
  let auditHtml = '';
  if (studyAudit.length === 0) {
    auditHtml = '<li style="padding: 10px; color: #888;">No activity logged yet.</li>';
  } else {
    for (let i = 0; i < studyAudit.length; i++) {
      let a = studyAudit[i];
      auditHtml += '<li style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:6px;"><span style="color:#004D40; font-weight:bold;">[' + fmtTime(a.created_at) + ']</span> — <b>' + escapeHtml(a.user_name) + '</b>: <span style="color:#d9534f; font-weight:600;">' + escapeHtml(a.action) + '</span> — <i>' + escapeHtml(a.detail || '') + '</i></li>';
    }
  }

  let html = '<div class="wrap"><div class="study-header"><button class="back-link no-print" onclick="backToDashboard()">← All Studies</button>';
  html += '<h1>' + escapeHtml(study.title) + '</h1>';
  html += '<div class="grid"><div><b>' + escapeHtml(study.protocol || '—') + '</b>Protocol</div><div><b>' + escapeHtml(study.sponsor || '—') + '</b>Sponsor</div><div><b>' + escapeHtml(study.pi || '—') + '</b>PI</div><div><b>' + escapeHtml(study.site || '—') + '</b>Site</div></div></div>';
  html += '<div class="section-head"><h2>Team Roster <span class="count">(' + state.entries.length + ')</span></h2>';
  html += '<div class="toolbar no-print"><button class="btn secondary" onclick="window.print()">Print / Export</button>';
  if (role.canDelegate) html += '<button class="btn" onclick="openAddModal()">+ Delegate Team Member</button>';
  html += '</div></div>';
  html += '<table class="roster"><thead><tr><th>Name</th><th>Role</th><th>Tasks</th><th>Period</th><th>Training</th><th>Staff Sig</th><th>PI Approval</th><th>Status</th><th class="no-print">Actions</th></tr></thead><tbody>' + rows + '</tbody></table>';
  html += '<div class="section-head" style="margin-top:24px;"><h2>Audit Trail</h2></div>';
  html += '<div class="audit-panel" style="background:#fdfdfd; border:1px solid #ccc; padding:16px; border-radius:8px;">';
  html += '<button class="audit-toggle no-print" id="auditToggleBtn">Toggle Audit Trail (' + studyAudit.length + ')</button>';
  html += '<ul class="audit-list" id="auditListEl" style="display:' + (auditOpen ? 'block' : 'none') + '; margin-top:12px; font-size:13px; font-family:monospace; max-height:300px; overflow-y:auto; list-style:none; padding-left:0;">' + auditHtml + '</ul></div></div>';
  return html;
}

function bindStudy() {
  document.getElementById('auditToggleBtn')?.addEventListener('click', () => {
    auditOpen = !auditOpen;
    render();
  });
}

function openAddModal() {
  closeModal();
  const div = document.createElement('div'); div.id = 'modalRoot';
  document.body.appendChild(div);

  let checkListHtml = '';
  for (let i = 0; i < RESPONSIBILITIES.length; i++) {
    checkListHtml += '<label><input type="checkbox" value="' + escapeHtml(RESPONSIBILITIES[i]) + '" id="resp-' + i + '"> ' + RESPONSIBILITIES[i] + '</label>';
  }

  div.innerHTML = '<div class="overlay"><div class="modal"><h3>Delegate Team Member</h3><div class="field"><label>Full Name</label><input id="m-name"></div><div class="field"><label>Role</label><input id="m-role"></div><div class="field"><label>Responsibilities</label><div class="checklist">' + checkListHtml + '</div></div><div class="modal-actions"><button class="btn secondary" id="add-cancel">Cancel</button><button class="btn" id="add-save">Save</button></div></div></div>';

  document.getElementById('add-cancel').addEventListener('click', closeModal);
  document.getElementById('add-save').addEventListener('click', async () => {
    const name = document.getElementById('m-name').value.trim();
    const roleTxt = document.getElementById('m-role').value.trim();
    if (!name || !roleTxt) { alert('Name and role required'); return; }

    let resp = [];
    for (let i = 0; i < RESPONSIBILITIES.length; i++) {
      if (document.getElementById('resp-' + i).checked) {
        resp.push(RESPONSIBILITIES[i]);
      }
    }
    if (resp.length === 0) { alert('Select at least one task'); return; }

    const entry = {
      study_id: activeStudyId,
      name: name,
      role: roleTxt,
      responsibilities: resp,
      start_date: new Date().toISOString().slice(0, 10),
      cv_on_file: true,
      deactivated: false
    };

    const { data } = await supabaseClient.from('delegation_entries').insert([entry]).select();
    if (data) {
      state.entries.push(data[0]);
      await logAudit(activeStudyId, 'Member Delegated', 'Delegated ' + name);
      closeModal();
      render();
    }
  });
}

function openCanvasModal(entryId, kind) {
  closeModal();
  const isPi = kind === 'pi';
  const entry = state.entries.find(e => e.id === entryId);
  const defaultName = isPi ? currentUser.name : (entry ? entry.name : currentUser.name);

  const div = document.createElement('div'); div.id = 'modalRoot';
  document.body.appendChild(div);

  div.innerHTML = '<div class="overlay"><div class="modal" style="max-width:460px;"><h3>' + (isPi ? 'PI E-Signature' : 'Staff E-Signature') + '</h3><div class="field"><label>Name</label><input id="cnv-name" value="' + escapeHtml(defaultName) + '"></div><div class="field"><label>Signature Pad</label><div style="border:2px dashed #004D40; background:#fff;"><canvas id="paintCanvas" width="400" height="150" style="width:100%; height:150px; cursor:crosshair;"></canvas></div></div><div class="modal-actions"><button class="btn secondary" id="cnv-cancel">Cancel</button><button class="btn" id="cnv-save">Confirm</button></div></div></div>';

  const canvas = document.getElementById('paintCanvas');
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let hasDrawn = false;
  ctx.strokeStyle = "#004D40";
  ctx.lineWidth = 2.5;

  canvas.addEventListener('mousedown', (e) => { isDrawing = true; hasDrawn = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); });
  canvas.addEventListener('mousemove', (e) => { if (!isDrawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); });
  canvas.addEventListener('mouseup', () => isDrawing = false);

  document.getElementById('cnv-cancel').addEventListener('click', closeModal);
  document.getElementById('cnv-save').addEventListener('click', async () => {
    const sigName = document.getElementById('cnv-name').value.trim();
    if (!sigName || !hasDrawn) { alert('Name and signature required'); return; }

    const dataUrl = canvas.toDataURL("image/png");
    const payload = isPi ? { pi_approval_name: sigName, pi_approval_timestamp: nowIso(), pi_approval_img: dataUrl } : { signature_name: sigName, signature_timestamp: nowIso(), signature_img: dataUrl };

    await supabaseClient.from('delegation_entries').update(payload).eq('id', entryId);
    await loadStudyEntries(activeStudyId);
    await logAudit(activeStudyId, isPi ? 'PI Signed' : 'Staff Signed', 'Signed by ' + sigName);
    closeModal();
    render();
  });
}

async function endDelegation(entryId) {
  if (!confirm('End delegation?')) return;
  await supabaseClient.from('delegation_entries').update({ deactivated: true, end_date: new Date().toISOString().slice(0, 10) }).eq('id', entryId);
  await loadStudyEntries(activeStudyId);
  render();
}

// Boot
loadAllData();