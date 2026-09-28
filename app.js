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
  console.error("Init Error:", e);
}

const RESPONSIBILITIES = [
  "Obtaining Informed Consent", "Medical History & Physical Exam", "Eligibility Screening",
  "IP Administration", "PK Blood Sample Collection", "Sample Processing & Storage",
  "Safety Monitoring", "AE Reporting", "CRF Completion", "QA / QC Review"
];

const ROLES = [
  { id: "PI", label: "Principal Investigator", canCreateStudy: true, canDelegate: true, canApprove: true, readOnly: false },
  { id: "CRC", label: "Clinical Research Coordinator", canCreateStudy: false, canDelegate: false, canApprove: false, readOnly: false },
  { id: "ADMIN", label: "Administrator", canCreateStudy: true, canDelegate: true, canApprove: true, readOnly: false }
];

function getRole(id) { return ROLES.find(r => r.id === id) || ROLES[1]; }

let state = { studies: [], entries: [], auditLog: [], users: [] };
let currentUser = null;
let screen = "login";
let authMode = "login";
let activeStudyId = null;

async function loadAllData() {
  if (!supabaseClient) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
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
    console.error("Load error:", e);
  }
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;
  
  if (screen === 'login') {
    app.innerHTML = '<div style="padding:40px; text-align:center;"><h2>Sign In</h2><input id="em" placeholder="Email"><br><input id="pw" type="password" placeholder="Password"><br><button id="btn-in">Login</button></div>';
    document.getElementById('btn-in').onclick = async () => {
      const email = document.getElementById('em').value;
      const pw = document.getElementById('pw').value;
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pw });
      if (error) alert(error.message);
      else loadAllData();
    };
  } else {
    app.innerHTML = '<div style="padding:20px;"><h1>Dashboard</h1><p>Welcome ' + (currentUser ? currentUser.name : '') + '</p><button onclick="supabaseClient.auth.signOut(); location.reload();">Sign Out</button></div>';
  }
}

loadAllData();