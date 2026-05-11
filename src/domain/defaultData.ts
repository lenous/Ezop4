export const roleLabels = {
  admin: 'Admin',
  dispatcher: 'Mistr',
  tpv: 'TPV',
  management: 'Vedení',
  operator: 'Operátor',
};

export const users = [
  { id:'u1', login:'admin',  role:'admin',      name:'Administrátor',    avatar:'🔧', color:'#ef4444' },
  { id:'u2', login:'mistr',  role:'dispatcher', name:'Jan Novák',        avatar:'👷', color:'#3b82f6' },
  { id:'u3', login:'tpv',    role:'tpv',        name:'Petra Svobodová',  avatar:'📐', color:'#a855f7' },
  { id:'u4', login:'vedeni', role:'management', name:'Karel Dvořák',     avatar:'📊', color:'#22c55e' },
  { id:'u5', login:'op1',    role:'operator',   name:'Marie Horáčková',  avatar:'⚙️', color:'#6b7280' },
  { id:'u6', login:'op2',    role:'operator',   name:'Tomáš Procházka',  avatar:'⚙️', color:'#6b7280' },
  { id:'u7', login:'op3',    role:'operator',   name:'Jana Kučerová',    avatar:'⚙️', color:'#6b7280' },
];

export const appSettings = {
  companyName: 'HC Electronics a.s.',
  lockTimeout: 8,
  allowOperatorQty: true,
  showKpiOperator: false,
  requireNoteOnIssue: true,
  notifyOnIssue: true,
  darkMode: true,
  language: 'cs',
  shiftHours: 8,
};

export const stations = [
  { id:1, name:'Sklad',                       icon:'📦' },
  { id:2, name:'Automat',                     icon:'🤖' },
  { id:3, name:'AOI',                         icon:'🔍' },
  { id:4, name:'RTG',                         icon:'☢️' },
  { id:5, name:'Montáž THT',                  icon:'🔩' },
  { id:6, name:'Pájení vlnou / selektivní',   icon:'🌊' },
  { id:7, name:'Oprava po pájení',            icon:'🛠️' },
  { id:8, name:'Výstupní kontrola',           icon:'✅' },
  { id:9, name:'Balení',                      icon:'📫' },
];

export const productionNotes = [
  { id:'pn1', orderId:'o1', stationId:5, type:'storage',
    text:'Polotovary uloženy v sušce - budova C, regál 4.',
    author:'Marie Horáčková', authorRole:'operator', createdAt:new Date(Date.now()-3600000*4).toISOString() },
  { id:'pn2', orderId:'o2', stationId:2, type:'material',
    text:'Zákazník dodal náhradu za R7 (10k -> 12k, ekvivalent). Schváleno TPV.',
    author:'Petra Svobodová', authorRole:'tpv', createdAt:new Date(Date.now()-3600000*8).toISOString() },
];

export const nextOrderCode = 261104;

export const orders = [
  { id:'o1', number:'261100', name:'Řídicí deska VB-300', priority:'urgent', qty:150,
    customer:'HC Electronics a.s.', due:'2025-05-15',
    orderDate:'2025-05-01', technology:'bezolovo', productionType:'repeat',
    stencilNumber:'3/0001', documents:[
      {name:'BOM_VB300_v3.xlsx', type:'bom',     size:48000},
      {name:'OSAZ_VB300.pdf',    type:'drawing', size:120000},
    ],
    stations: [
      { stId:1, status:'completed',  qtyOk:150, qtyRework:0, qtyScrap:0, qtyReceived:150 },
      { stId:2, status:'completed',  qtyOk:148, qtyRework:2, qtyScrap:0, qtyReceived:150 },
      { stId:3, status:'waiting',    qtyOk:0,   qtyRework:0, qtyScrap:0, qtyReceived:0 },
      { stId:4, status:'waiting',    qtyOk:0,   qtyRework:0, qtyScrap:0, qtyReceived:0 },
      { stId:5, status:'in_progress',qtyOk:80,  qtyRework:5, qtyScrap:1, qtyReceived:148 },
      { stId:6, status:'waiting',    qtyOk:0,   qtyRework:0, qtyScrap:0, qtyReceived:0 },
      { stId:7, status:'waiting',    qtyOk:0,   qtyRework:0, qtyScrap:0, qtyReceived:0 },
      { stId:8, status:'waiting',    qtyOk:0,   qtyRework:0, qtyScrap:0, qtyReceived:0 },
      { stId:9, status:'waiting',    qtyOk:0,   qtyRework:0, qtyScrap:0, qtyReceived:0 },
    ]
  },
  { id:'o2', number:'261101', name:'Napájecí modul PM-24V', priority:'high', qty:300,
    customer:'TechCorp s.r.o.', due:'2025-05-20',
    orderDate:'2025-05-02', technology:'bezolovo', productionType:'new',
    stencilNumber:'3/0002', documents:[{name:'BOM_PM24V.xlsx', type:'bom', size:32000}],
    stations: [
      { stId:1, status:'completed',   qtyOk:300, qtyRework:0,  qtyScrap:0, qtyReceived:300 },
      { stId:2, status:'in_progress', qtyOk:200, qtyRework:10, qtyScrap:2, qtyReceived:300 },
      { stId:3, status:'waiting',     qtyOk:0,   qtyRework:0,  qtyScrap:0, qtyReceived:0 },
      { stId:6, status:'waiting',     qtyOk:0,   qtyRework:0,  qtyScrap:0, qtyReceived:0 },
      { stId:8, status:'waiting',     qtyOk:0,   qtyRework:0,  qtyScrap:0, qtyReceived:0 },
      { stId:9, status:'waiting',     qtyOk:0,   qtyRework:0,  qtyScrap:0, qtyReceived:0 },
    ]
  },
  { id:'o3', number:'261102', name:'Senzorická PCB SR-10', priority:'normal', qty:500,
    customer:'AutoElektro k.s.', due:'2025-06-01',
    orderDate:'2025-05-03', technology:'olovo', productionType:'revision',
    stencilNumber:'3/0003', documents:[],
    stations: [
      { stId:1, status:'completed', qtyOk:500, qtyRework:0,  qtyScrap:0,  qtyReceived:500 },
      { stId:2, status:'completed', qtyOk:495, qtyRework:5,  qtyScrap:0,  qtyReceived:500 },
      { stId:3, status:'completed', qtyOk:490, qtyRework:10, qtyScrap:5,  qtyReceived:495 },
      { stId:5, status:'completed', qtyOk:480, qtyRework:8,  qtyScrap:2,  qtyReceived:490 },
      { stId:6, status:'issue',     qtyOk:200, qtyRework:20, qtyScrap:10, qtyReceived:480 },
      { stId:7, status:'waiting',   qtyOk:0,   qtyRework:0,  qtyScrap:0,  qtyReceived:0 },
      { stId:8, status:'waiting',   qtyOk:0,   qtyRework:0,  qtyScrap:0,  qtyReceived:0 },
      { stId:9, status:'waiting',   qtyOk:0,   qtyRework:0,  qtyScrap:0,  qtyReceived:0 },
    ]
  },
  { id:'o4', number:'261103', name:'Komunikační modul CM-5G', priority:'low', qty:50,
    customer:'SmartHome a.s.', due:'2025-06-10',
    orderDate:'2025-05-05', technology:'bezolovo', productionType:'new',
    stencilNumber:'', documents:[],
    stations: [
      { stId:1, status:'waiting', qtyOk:0, qtyRework:0, qtyScrap:0, qtyReceived:0 },
      { stId:2, status:'waiting', qtyOk:0, qtyRework:0, qtyScrap:0, qtyReceived:0 },
      { stId:5, status:'waiting', qtyOk:0, qtyRework:0, qtyScrap:0, qtyReceived:0 },
      { stId:8, status:'waiting', qtyOk:0, qtyRework:0, qtyScrap:0, qtyReceived:0 },
      { stId:9, status:'waiting', qtyOk:0, qtyRework:0, qtyScrap:0, qtyReceived:0 },
    ]
  },
];

export const defaults = {
  users,
  roleLabels,
  appSettings,
  stations,
  productionNotes,
  nextOrderCode,
  orders,
};
