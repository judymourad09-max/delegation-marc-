/* ---------------- Supabase Setup ---------------- */
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

const RESPONSIBILITIES = [
  "Obtaining Informed Consent", "Medical History & Physical Exam", "Eligibility Screening",
  "IP Administration", "PK Blood Sample Collection", "Sample Processing & Storage",
  "Safety Monitoring", "AE Reporting", "CRF Completion", "QA / QC Review"
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
  { id: "ADMIN", label: "Administrator", canCreateStudy: true, canDelegate: true, canApprove: true, readOnly: false }
];

function getRole(id) {
  return ROLES.find(r => r.id === id) || ROLES[2];
}

let state = { studies: [], entries: [], auditLog: [], users: [] };
let currentUser = null;
let screen = "login";
let authMode = "login";
let activeStudyId = null;

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

async function loadAllData() {
  if (!supabaseClient) return;
  try {
    const { data: { session }, error: authErr } = await supabaseClient.auth.getSession();
    if (authErr) throw authErr;

    if (session && session.user) {
      const u = session.user;
      currentUser = {
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || u.email,
        roleId: u.user_metadata?.role_id || "CRC"
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
  }
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;
  
  if (screen === 'login') {
    app.innerHTML = '<div style="padding:40px; text-align:center; font-family:sans-serif;"><h2>Sign In</h2><input id="auth-email" placeholder="Email" style="padding:8px; margin:5px;"><br><input id="auth-pass" type="password" placeholder="Password" style="padding:8px; margin:5px;"><br><button id="auth-btn" style="padding:8px 16px; margin:10px; background:#004D40; color:#fff; border:none; border-radius:4px; cursor:pointer;">Sign In</button></div>';
    
    document.getElementById('auth-btn').onclick = async () => {
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-pass').value.trim();
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        alert("Sign in failed: " + error.message);
      } else {
        await loadAllData();
      }
    };
  } else if (screen === 'dashboard') {
    let studiesHtml = '';
    for (let i = 0; i < state.studies.length; i++) {
      let s = state.studies[i];
      studiesHtml += '<div style="border:1px solid #ccc; padding:15px; margin:10px; border-radius:6px; background:#fff; cursor:pointer;" onclick="openStudy(\'' + s.id + '\')">';
      studiesHtml += '<h3>' + escapeHtml(s.title) + '</h3>';
      studiesHtml += '<p>Protocol: ' + escapeHtml(s.protocol || '—') + '</p>';
      studiesHtml += '</div>';
    }

    app.innerHTML = '<div style="padding:20px; font-family:sans-serif;"><div style="display:flex; justify-content:space-between; align-items:center;"><h2>Studies Dashboard</h2><button onclick="supabaseClient.auth.signOut(); currentUser=null; screen=\'login\'; render();" style="padding:6px 12px; background:#d9534f; color:#fff; border:none; border-radius:4px; cursor:pointer;">Sign Out</button></div><div style="margin-top:20px;">' + (studiesHtml || '<p>No studies found.</p>') + '</div></div>';
  } else if (screen === 'study') {
    let study = state.studies.find(s => s.id === activeStudyId);
    app.innerHTML = '<div style="padding:20px; font-family:sans-serif;"><button onclick="screen=\'dashboard\'; render();" style="padding:6px 12px; margin-bottom:15px; cursor:pointer;">← Back to Dashboard</button><h2>' + escapeHtml(study ? study.title : 'Study Details') + '</h2><p>Study Roster and Delegation features are active.</p></div>';
  }
}

window.openStudy = function(id) {
  activeStudyId = id;
  screen = 'study';
  render();
};

loadAllData();