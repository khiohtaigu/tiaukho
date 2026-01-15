import './index.css';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Search, ChevronDown, ChevronRight,
  RefreshCw, User, BookOpen, Layers,
  Settings, Lock, Plus, Trash2, Globe, CheckCircle2, XCircle, ArrowRightLeft, School, ArrowRight, X, MousePointerClick, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';

// 引入 Firebase
import { db } from './firebase';
import { doc, setDoc, onSnapshot } from "firebase/firestore";

// --- 常數定義 ---
const DAYS = ['週一', '週二', '週三', '週四', '週五'];
const PERIODS = [
  { id: 1, label: '第1節', time: '08:10-09:00' },
  { id: 2, label: '第2節', time: '09:10-10:00' },
  { id: 3, label: '第3節', time: '10:10-11:00' },
  { id: 4, label: '第4節', time: '11:10-12:00' },
  { id: 5, label: '午休', isRest: true },
  { id: 6, label: '第5節', time: '13:10-14:00' },
  { id: 7, label: '第6節', time: '14:10-15:00' },
  { id: 8, label: '第7節', time: '15:10-16:00' },
  { id: 9, label: '第8節', time: '16:10-17:00' },
];

const SIDEBAR_ORDER = ['國文', '英文', '數學', '自然科', '社會科', '藝能科', '本土語'];

// --- 調整 1：藝能科精確排序 ---
const DOMAIN_SUB_ORDER = {
  '自然科': ['物理', '化學', '生物', '地球科學', '半導體'],
  '藝能科': ['音樂', '美術', '家政', '生活科技', '資訊科技', '健護', '體育', '全民國防', '輔導', '生命教育', '藝術生活'],
  '社會科': ['歷史', '地理', '公民']
};

const SCHOOL_LIST = [
  { id: 'fssh', name: '鳳山高級中學', password: 'fssh' }
];

export default function App() {
  const currentYear = new Date().getFullYear();
  const [landingStage, setLandingStage] = useState(0); 
  const [currentSchool, setCurrentSchool] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [dbData, setDbData] = useState({ teachers: [], schedules: [], classes: [], constraints: [] });
  const [activeView, setActiveView] = useState('schedule'); 
  const [sidebarMode, setSidebarMode] = useState('teacher');
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditMode, setIsEditMode] = useState(false); 
  
  const [activeMainKey, setActiveMainKey] = useState(null); 
  const [activeSubKey, setActiveSubKey] = useState(null);
  const [gradeExpanded, setGradeExpanded] = useState({ '高1': true, '高2': true, '高3': true });
  
  const [constraints, setConstraints] = useState([]);
  const [newRule, setNewRule] = useState({ type: 'classes', target: '1', classList: '', days: [], periods: [], desc: '' });
  const [proposals, setProposals] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);

  const schedules = useMemo(() => dbData.schedules || [], [dbData.schedules]);
  const teachers = useMemo(() => [...(dbData.teachers || [])].sort((a, b) => (a.order || 999) - (b.order || 999)), [dbData.teachers]);
  const classes = useMemo(() => dbData.classes || [], [dbData.classes]);

  // --- 調整 3 & 4：智慧歸類邏輯 (支援跨學科老師在多處出現) ---
  const sidebarData = useMemo(() => {
    const data = { core: {}, domains: {} };
    
    // 初始化
    SIDEBAR_ORDER.forEach(key => {
        if (key.includes('科')) data.domains[key] = {};
        else data.core[key] = [];
    });

    teachers.forEach(t => {
      const targetBuckets = [];

      // 判斷該老師該出現在哪些分類裡
      if (t.teachesNative || t.subject === '本土語') targetBuckets.push({ type: 'core', key: '本土語' });
      
      // 音樂與藝術生活老師應多處出現
      if (t.subject === '音樂') targetBuckets.push({ type: 'domain', domain: '藝能科', sub: '音樂' });
      if (t.subject === '藝術生活') targetBuckets.push({ type: 'domain', domain: '藝能科', sub: '藝術生活' });

      // 原始主學科歸類
      if (['自然科', '社會科', '藝能科'].includes(t.domain)) {
        targetBuckets.push({ type: 'domain', domain: t.domain, sub: t.subject });
      } else {
        if (t.subject !== '本土語') targetBuckets.push({ type: 'core', key: t.subject });
      }

      // 執行歸類 (去重)
      const uniqueBuckets = Array.from(new Set(targetBuckets.map(JSON.stringify))).map(JSON.parse);
      uniqueBuckets.forEach(b => {
        if (b.type === 'core') {
            if (!data.core[b.key]) data.core[b.key] = [];
            if (!data.core[b.key].find(x => x.id === t.id)) data.core[b.key].push(t);
        } else {
            if (!data.domains[b.domain]) data.domains[b.domain] = {};
            if (!data.domains[b.domain][b.sub]) data.domains[b.domain][b.sub] = [];
            if (!data.domains[b.domain][b.sub].find(x => x.id === t.id)) data.domains[b.domain][b.sub].push(t);
        }
      });
    });

    // 依照指定的 DOMAIN_SUB_ORDER 進行最終排序
    Object.keys(data.domains).forEach(domainKey => {
      const subOrder = DOMAIN_SUB_ORDER[domainKey] || [];
      const sortedSubs = {};
      subOrder.forEach(sub => { if (data.domains[domainKey][sub]) sortedSubs[sub] = data.domains[domainKey][sub]; });
      Object.keys(data.domains[domainKey]).forEach(sub => { if (!subOrder.includes(sub)) sortedSubs[sub] = data.domains[domainKey][sub]; });
      data.domains[domainKey] = sortedSubs;
    });

    return data;
  }, [teachers]);

  const groupedClasses = useMemo(() => {
    const groups = {};
    classes.forEach(c => {
      const grade = c.grade || "其他";
      if (!groups[grade]) groups[grade] = [];
      groups[grade].push(c);
    });
    return groups;
  }, [classes]);

  useEffect(() => {
    if (!currentSchool) return;
    setIsLoading(true);
    const unsub = onSnapshot(doc(db, "schools", currentSchool.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDbData(data);
        setConstraints(data.constraints || []);
      } else {
        setDbData({ teachers: [], schedules: [], classes: [], constraints: [] });
        setConstraints([]);
      }
      setIsLoading(false);
    });
    return () => unsub();
  }, [currentSchool]);

  // --- 調整 2：禁區邏輯 (支援 101-105 連字號語法) ---
  const checkIsLocked = (classId, dayIdx, periodId) => {
    if (!classId || classId === "未知") return null;
    const gradeLetter = classId.charAt(0);
    return constraints.find(rule => {
      if (!rule.days?.includes(dayIdx) || !rule.periods?.includes(periodId)) return false;
      if (rule.type === 'all') return true;
      if (rule.type === 'grade') return String(rule.target) === String(gradeLetter);
      
      // 解析班級，加入範圍解析 (e.g., 101-105)
      const targetList = String(rule.target).split(/[,，、\s]+/).flatMap(part => {
          if (part.includes('-')) {
              const [start, end] = part.split('-').map(n => parseInt(n.trim()));
              if (!isNaN(start) && !isNaN(end)) {
                  return Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
              }
          }
          return part.trim();
      });
      return targetList.includes(classId);
    });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const newSchedules = []; const newTeachers = []; const newConstraints = [];
        const teacherCache = {}; const classSet = new Set(); const scheduleCheck = new Set();
        const nativeTeachersNames = new Set();
        const dayMap = { '週一': 0, '週二': 1, '週三': 2, '週四': 3, '週五': 4 };
        const periodMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 7, 7: 8, 8: 9 };
        const periodLabelMap = { '第1節': 1, '第2節': 2, '第3節': 3, '第4節': 4, '第5節': 6, '第6節': 7, '第7節': 8, '第8節': 9 };

        workbook.SheetNames.forEach(sheetName => {
          const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          if (sheetName.includes("本土語")) json.forEach(r => { if(r['老師姓名']) nativeTeachersNames.add(String(r['老師姓名']).trim()); });
          
          if (sheetName === "禁區設定") {
            json.forEach((row, idx) => {
              const typeRaw = String(row['類型'] || ''); if (!typeRaw) return;
              let type = 'classes'; let target = typeRaw;
              if (typeRaw.includes('全校')) type = 'all';
              else if (typeRaw.includes('高一全')) { type = 'grade'; target = '1'; }
              else if (typeRaw.includes('高二全')) { type = 'grade'; target = '2'; }
              else if (typeRaw.includes('高三全')) { type = 'grade'; target = '3'; }
              newConstraints.push({ id: `C${idx}-${Date.now()}`, type, target: String(target), days: [dayMap[String(row['星期'])] ?? 0], periods: [periodLabelMap[String(row['節次'])] ?? 1], desc: String(row['說明'] || '') });
            });
          } else {
            json.forEach(row => {
              const tName = String(row['老師姓名'] || '').trim();
              if (!tName || tName === 'nan') return;
              if (!teacherCache[tName]) {
                const adminRole = String(row['行政職稱'] || '');
                teacherCache[tName] = { id: `T${newTeachers.length+1}`, name: tName, order: parseInt(row['編號'])||999, domain: String(row['領域']||''), subject: String(row['學科']||''), adminRole: adminRole==='nan'?'':adminRole, isAdjunct: adminRole.includes('兼課'), isHomeroom: row['是否導師']==='是', teachesNative: nativeTeachersNames.has(tName) };
                newTeachers.push(teacherCache[tName]);
              }
              const d = dayMap[String(row['星期'])]; const p = periodMap[Number(row['節次'])];
              if (d!==undefined && p!==undefined) {
                const key = `${tName}-${d}-${p}`;
                if (!scheduleCheck.has(key)) {
                  const cId = String(row['班級']||'').trim();
                  if (cId && cId !== '未知' && cId !== 'nan') classSet.add(cId);
                  newSchedules.push({ id: `S${newSchedules.length}`, teacherName: tName, classId: cId, subject: String(row['表原始名稱'] || row['課表原始名稱'] || '課程'), day: d, period: p });
                  scheduleCheck.add(key);
                }
              }
            });
          }
        });
        const finalClasses = Array.from(classSet).sort().map(c => ({ id: c, name: `${c}班`, grade: `高${c[0]}` }));
        await setDoc(doc(db, "schools", currentSchool.id), { teachers: newTeachers, schedules: newSchedules, classes: finalClasses, constraints: newConstraints });
        alert("資料已更新！");
      } catch (err) { alert("匯入失敗。"); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleAdminLogin = () => {
    if (loginPassword === SCHOOL_LIST[0].password) { setIsAdmin(true); setCurrentSchool(SCHOOL_LIST[0]); setShowLoginModal(false); setLandingStage(2); }
    else alert("密碼錯誤");
  };

  const getCellData = (dayIdx, periodId) => {
    if (sidebarMode === 'teacher' && selectedTeacher) {
      return schedules.filter(s => s.teacherName === selectedTeacher.name && s.day === dayIdx && s.period === periodId).slice(0, 1);
    } else if (sidebarMode === 'class' && selectedClass) {
      return schedules.filter(s => s.classId === selectedClass.id && s.day === dayIdx && s.period === periodId).slice(0, 1);
    }
    return [];
  };

  const analyzeMove = (source, targetDay, targetPeriod) => {
    const srcDay = source.day; const srcPeriod = source.period;
    const occupantInTarget = schedules.find(s => s.classId === source.classId && s.day === targetDay && s.period === targetPeriod);
    const isT1BusyAtDest = schedules.some(s => s.teacherName === source.teacherName && s.day === targetDay && s.period === targetPeriod && s.id !== source.id);
    const options = [];
    if (!occupantInTarget && !isT1BusyAtDest) {
      options.push({ type: 'MOVE', title: '直接移動', desc: `移至 ${DAYS[targetDay]} ${PERIODS.find(p=>p.id===targetPeriod)?.label}`, impact: '雙方皆空堂，無衝突', color: 'blue', action: () => executeMove([{ id: source.id, d: targetDay, p: targetPeriod }]) });
    } else if (occupantInTarget) {
      const otherT = occupantInTarget.teacherName;
      const isOtherTFreeAtSource = !schedules.some(s => s.teacherName === otherT && s.day === srcDay && s.period === srcPeriod);
      if (isOtherTFreeAtSource) {
        options.push({ type: 'SWAP', title: '兩課對調 (Swap)', desc: `與 ${otherT} 老師對調時段`, impact: '互換時段', color: 'indigo', action: () => executeMove([{ id: source.id, d: targetDay, p: targetPeriod }, { id: occupantInTarget.id, d: srcDay, p: srcPeriod }]) });
      } else {
        options.push({ type: 'CONFLICT', title: '偵測到衝突', desc: `無法對調：${otherT} 老師在原時段已有其他課。`, impact: '建議採取多角調動', color: 'red', disabled: true });
      }
    } else if (isT1BusyAtDest) {
        options.push({ type: 'CONFLICT', title: '行程衝突', desc: `${source.teacherName} 在目標時段已有其他課。`, impact: '無法直接移動', color: 'red', disabled: true });
    }
    setProposals(options);
  };

  const handleDrop = (targetDay, targetPeriod) => {
    if (!draggedItem || !isEditMode) return;
    const lockInfo = checkIsLocked(draggedItem.classId, targetDay, targetPeriod);
    if (lockInfo) return alert(`無法調動：此時段為「${lockInfo.desc}」禁區。`);
    analyzeMove(draggedItem, targetDay, targetPeriod);
  };

  const executeMove = async (moves) => {
    const next = [...schedules];
    moves.forEach(m => { const idx = next.findIndex(s => s.id === m.id); if (idx !== -1) next[idx] = { ...next[idx], day: m.d, period: m.p }; });
    try { await setDoc(doc(db, "schools", currentSchool.id), { ...dbData, schedules: next, constraints: constraints }); setProposals([]); setIsEditMode(false); } catch (e) { alert("失敗"); }
  };

  const toggleMain = (key) => { setActiveMainKey(prev => prev === key ? null : key); setActiveSubKey(null); };
  const toggleSub = (e, key) => { e.stopPropagation(); setActiveSubKey(prev => prev === key ? null : key); };

  const TeacherItem = ({ t }) => (
    <button onClick={() => { setSelectedTeacher(t); setSelectedClass(null); setActiveView('schedule'); }} className={`w-full text-left px-4 py-3 text-lg flex items-center justify-between transition-all rounded-md mb-1 ${selectedTeacher?.id === t.id ? 'bg-[#1e40af] text-white font-black shadow-lg scale-[1.02]' : 'text-slate-600 hover:bg-slate-200 font-bold'}`}>
      <div className="flex items-center gap-2 truncate font-serif">
        <span className="truncate">{t.name}</span>
        {t.adminRole && t.adminRole !== "兼課" && <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedTeacher?.id === t.id ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'}`}>{t.adminRole}</span>}
        {t.isAdjunct && <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedTeacher?.id === t.id ? 'bg-white text-slate-700' : 'bg-slate-500 text-white'}`}>兼</span>}
        {t.isHomeroom && <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedTeacher?.id === t.id ? 'bg-white text-orange-600' : 'bg-orange-500 text-white'}`}>導</span>}
      </div>
    </button>
  );

  if (landingStage === 0) {
    return (
      <div className="flex flex-col h-screen w-full bg-[#fdfaf1] items-center justify-center overflow-hidden">
        <div className="bg-white rounded-[4rem] shadow-2xl border-[6px] border-[#fbda8b] p-20 text-center animate-in zoom-in duration-700 max-w-4xl w-[90%]">
          <h1 className="text-9xl font-black text-[#1e3a8a] mb-10 tracking-tighter leading-none font-sans">天才小調手</h1>
          <p className="text-4xl font-bold text-[#3b82f6] tracking-[0.25em] mb-16 uppercase leading-none font-sans">智慧調課系統</p>
          <button onClick={() => setLandingStage(1)} className="bg-[#fbda8b] hover:bg-[#f9cf6a] text-[#1e3a8a] px-14 py-7 rounded-[2.5rem] text-4xl font-black shadow-xl transition-all flex items-center gap-5 mx-auto active:scale-95 font-sans">點擊進入 <ArrowRight size={40} /></button>
        </div>
        <div className="mt-12 text-slate-400 font-bold text-base tracking-widest uppercase font-sans">© {currentYear} 天才小調手 X 耀毅. All Rights Reserved.</div>
      </div>
    );
  }

  if (landingStage === 1) {
    return (
      <div className="flex flex-col h-screen w-full bg-[#f1f5f9] items-center justify-center overflow-hidden font-sans">
        <div className="bg-white rounded-[3.5rem] shadow-2xl border-2 border-slate-200 p-16 text-center animate-in slide-in-from-bottom-8 duration-700 max-w-lg w-full mx-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-3 bg-[#1e40af]"></div>
          <School size={80} className="mx-auto text-[#1e3a8a] mb-8 mt-4" />
          <h3 className="text-5xl font-black text-slate-800 mb-12 tracking-tight">鳳山高級中學</h3>
          <div className="flex flex-col gap-6">
            <button onClick={() => { setIsAdmin(false); setCurrentSchool(SCHOOL_LIST[0]); setLandingStage(2); }} className="w-full bg-[#1e40af] text-white py-6 rounded-3xl font-black text-2xl hover:bg-blue-900 transition-all shadow-xl active:scale-[0.98]">直接進入 (檢視用)</button>
            <button onClick={() => setShowLoginModal(true)} className="w-full bg-white text-[#1e40af] border-4 border-[#1e40af] py-6 rounded-3xl font-black text-2xl hover:bg-blue-50 transition-all active:scale-[0.98]">管理員登入</button>
          </div>
          <button onClick={() => setLandingStage(0)} className="mt-10 text-slate-400 font-bold text-lg hover:text-slate-600 transition-colors flex items-center justify-center gap-2 mx-auto">← 返回首頁</button>
        </div>
        {showLoginModal && (
            <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-in fade-in duration-300">
                <div className="bg-white rounded-[3rem] p-12 max-w-md w-full shadow-2xl border-4 border-[#1e40af] relative">
                    <button onClick={() => setShowLoginModal(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-600"><X size={32}/></button>
                    <div className="w-20 h-20 bg-blue-100 text-[#1e40af] rounded-3xl flex items-center justify-center mb-8 mx-auto"><Lock size={40}/></div>
                    <h3 className="text-3xl font-black text-center text-slate-800 mb-4">管理員驗證</h3>
                    <input type="password" autoFocus className="w-full p-5 bg-slate-100 rounded-2xl border-none text-center text-2xl font-black focus:ring-4 mb-8" placeholder="••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()} />
                    <button onClick={handleAdminLogin} className="w-full bg-[#1e40af] text-white py-5 rounded-2xl font-black text-xl hover:bg-blue-900">確認登入</button>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#f1f5f9] text-slate-900 overflow-hidden font-serif">
      <aside className="w-80 bg-white border-r border-slate-300 flex flex-col shadow-xl z-20 shrink-0 font-sans">
        <div className="p-6 bg-[#1e3a8a] text-white shrink-0">
          <button onClick={() => { setLandingStage(1); setSelectedTeacher(null); setSelectedClass(null); }} className="text-xs font-black uppercase tracking-widest text-slate-300 hover:text-white flex items-center gap-1 mb-2 transition-colors underline underline-offset-4 leading-none">← 切換學校</button>
          <h1 className="text-2xl font-black flex items-center gap-2 tracking-tight leading-tight font-serif"><Calendar size={28} /> {currentSchool?.name}</h1>
        </div>
        <div className="flex p-2 bg-slate-100 border-b border-slate-300 shrink-0">
          <button onClick={() => setSidebarMode('teacher')} className={`flex-1 py-3 rounded-lg text-base font-black transition-all ${sidebarMode === 'teacher' ? 'bg-white shadow-md text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}>教師列表</button>
          <button onClick={() => setSidebarMode('class')} className={`flex-1 py-3 rounded-lg text-base font-black transition-all ${sidebarMode === 'class' ? 'bg-white shadow-md text-blue-700' : 'text-slate-500'}`}>班級列表</button>
        </div>
        <div className="p-4 border-b border-slate-300 bg-white shrink-0 font-serif"><div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={20} /><input type="text" placeholder="搜尋姓名、學科..." className="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-xl text-base font-bold outline-none placeholder-slate-400" onChange={(e) => setSearchTerm(e.target.value)} /></div></div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-white font-serif">
          {sidebarMode === 'teacher' ? (
            <div className="space-y-2 pb-10 font-serif">
              {SIDEBAR_ORDER.map(key => {
                const members = sidebarData.core[key]; const domains = sidebarData.domains[key];
                if (members) {
                  const filtered = members.filter(m => m.name.includes(searchTerm));
                  if (filtered.length === 0 && searchTerm) return null;
                  const isExpanded = activeMainKey === key || searchTerm !== '';
                  return (
                    <div key={key}>
                      <button onClick={() => toggleMain(key)} className="w-full flex items-center justify-between p-4 hover:bg-slate-100 rounded-xl group font-black text-lg text-slate-800 leading-none font-sans"><div className="flex items-center gap-3 font-sans"><BookOpen size={20} className="text-blue-600"/>{key === '本土語' ? key : key + '科'}</div>{isExpanded ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}</button>
                      {isExpanded && <div className="ml-7 border-l-2 border-slate-200 pl-3 mt-1 font-serif">{filtered.map(t => <TeacherItem key={t.id} t={t}/>)}</div>}
                    </div>
                  );
                }
                if (domains) {
                  const isExpanded = activeMainKey === key || searchTerm !== '';
                  return (
                    <div key={key} className="mb-2 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                      <button onClick={() => toggleMain(key)} className="w-full flex items-center justify-between p-4 bg-slate-100/80 hover:bg-slate-200 transition-colors leading-none font-black text-lg text-indigo-900 font-sans"><div className="flex items-center gap-3 font-sans"><Layers size={20} className="text-indigo-600"/>{key}</div>{isExpanded ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}</button>
                      {isExpanded && <div className="p-2 space-y-1">{Object.entries(domains).map(([sub, subMembers]) => {
                        const isSubExp = activeSubKey === (key + sub) || searchTerm !== '';
                        const filteredSub = subMembers.filter(m => m.name.includes(searchTerm));
                        if (filteredSub.length === 0 && searchTerm) return null;
                        return (<div key={sub}><button onClick={(e) => toggleSub(e, key + sub)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white rounded-xl text-base font-black text-slate-600 shadow-sm border border-transparent leading-none font-sans"><span>{sub}</span>{isSubExp ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}</button>
                          {isSubExp && <div className="ml-4 border-l-2 border-slate-200 pl-2 mt-1 font-serif">{filteredSub.map(t => <TeacherItem key={t.id} t={t}/>)}</div>}</div>);
                      })}</div>}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ) : (
            <div className="space-y-4 p-1 pb-10 font-serif">
              {Object.entries(groupedClasses).map(([grade, list]) => (
                <div key={grade} className="mb-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden font-sans">
                  <button onClick={() => setGradeExpanded(p => ({...p, [grade]: !p[grade]}))} className="w-full flex items-center justify-between p-5 bg-slate-50 font-black text-xl text-slate-800 leading-none">{grade} {gradeExpanded[grade] ? <ChevronDown /> : <ChevronRight />}</button>
                  {gradeExpanded[grade] && <div className="p-4 grid grid-cols-3 gap-3">
                    {list.map(c => <button key={c.id} onClick={() => { setSelectedClass(c); setSelectedTeacher(null); setActiveView('schedule'); }} className={`py-4 rounded-xl text-lg font-black border-2 ${selectedClass?.id === c.id ? 'bg-[#1e40af] text-white border-blue-700 shadow-lg scale-105' : 'bg-white text-slate-700 border-slate-100 hover:border-blue-300 hover:bg-blue-50'} leading-none`}>{c.id}</button>)}
                  </div>}
                </div>
              ))}
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 font-sans"><label className="flex items-center gap-3 px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 group shadow-sm leading-none"><Settings className="text-slate-400 group-hover:rotate-90 transition-all" size={24} /><span className="font-black text-slate-600 font-serif">配課表匯入</span><input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} /></label></div>
        )}
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 font-serif">
        <header className="h-24 bg-white border-b-2 border-slate-200 flex items-center justify-between px-10 shadow-sm shrink-0 z-10 font-sans">
          <div className="flex items-center gap-6 leading-none">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl ${sidebarMode === 'teacher' ? (selectedTeacher?.isAdjunct ? 'bg-slate-700' : 'bg-[#1e40af]') : 'bg-blue-800'}`}><User size={32}/></div>
            <div className="leading-tight"><h2 className="text-3xl font-black text-slate-900 tracking-tight mb-1 leading-none">{sidebarMode === 'teacher' ? (selectedTeacher?.name || '請由左側選擇') : (selectedClass?.name || '請由左側選擇')} 的週課表</h2><span className="text-blue-600 font-bold text-base">{sidebarMode === 'teacher' ? (selectedTeacher?.subject ? `${selectedTeacher.subject}科` : '') : (selectedClass?.grade || '')}</span></div>
          </div>
          <div className="flex gap-3 leading-none font-sans">
            {isAdmin && <button onClick={() => setIsEditMode(!isEditMode)} className={`px-6 py-2.5 rounded-xl font-black text-sm border-2 leading-none ${isEditMode ? 'bg-orange-500 text-white border-orange-600 shadow-lg animate-pulse' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{isEditMode ? '停止調課' : '進行調課'}</button>}
            <button onClick={() => setActiveView('schedule')} className={`px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 leading-none ${activeView === 'schedule' ? 'bg-[#1e40af] text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><BookOpen size={18}/> 檢視課表</button>
            {isAdmin && <button onClick={() => setActiveView(activeView === 'settings' ? 'schedule' : 'settings')} className={`px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 leading-none ${activeView === 'settings' ? 'bg-[#1e40af] text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><Settings size={18}/>排課設定</button>}
          </div>
        </header>

        {activeView === 'settings' ? (
          <div className="flex-1 p-10 overflow-y-auto bg-slate-50 custom-scrollbar pb-32 font-sans">
            <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-[2rem] shadow-xl border-2 border-slate-200 p-10 relative font-sans">
                <h3 className="text-3xl font-black text-slate-800 flex items-center gap-3 mb-10 leading-none font-serif"><Plus size={32} className="text-blue-600"/> 新增排課禁區規則</h3>
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div><label className="block text-sm font-black text-slate-400 mb-4 tracking-widest uppercase">適用範圍</label>
                      <div className="flex gap-2 font-sans">
                        <button onClick={() => setNewRule({...newRule, type:'all'})} className={`flex-1 py-4 rounded-xl border-2 font-black leading-none ${newRule.type==='all'?'bg-blue-50 border-blue-600 text-blue-700':'bg-white border-slate-100 text-slate-400'}`}>全校</button>
                        <button onClick={() => setNewRule({...newRule, type:'grade'})} className={`flex-1 py-4 rounded-xl border-2 font-black leading-none ${newRule.type==='grade'?'bg-blue-50 border-blue-600 text-blue-700':'bg-white border-slate-100 text-slate-400'}`}>特定年級</button>
                        <button onClick={() => setNewRule({...newRule, type:'classes'})} className={`flex-1 py-4 rounded-xl border-2 font-black leading-none ${newRule.type==='classes'?'bg-blue-50 border-blue-600 text-blue-700':'bg-white border-slate-100 text-slate-400'}`}>特定班級</button>
                      </div>
                      <div className="mt-4">
                        {newRule.type === 'grade' && <select className="w-full p-4 bg-slate-100 rounded-xl border-none font-black text-lg font-sans" value={newRule.target} onChange={e=>setNewRule({...newRule, target:e.target.value})}><option value="1">高一年級</option><option value="2">高二年級</option><option value="3">高三年級</option></select>}
                        {newRule.type === 'classes' && <input type="text" placeholder="例如: 201、202-205" className="w-full p-4 bg-slate-100 rounded-xl border-none font-black text-lg font-serif" value={newRule.classList} onChange={e=>setNewRule({...newRule, classList:e.target.value})} />}
                      </div>
                    </div>
                    <div><label className="block text-sm font-black text-slate-400 mb-4 tracking-widest uppercase leading-none">規則說明</label><input type="text" placeholder="說明" className="w-full p-4 bg-slate-100 rounded-xl border-none font-black text-lg h-16 font-serif" value={newRule.desc} onChange={e=>setNewRule({...newRule, desc:e.target.value})} /></div>
                  </div>
                  <div><label className="block text-sm font-black text-slate-400 mb-4 tracking-widest uppercase leading-none">鎖定時段</label>
                    <div className="flex flex-wrap gap-2 mb-6 leading-none font-sans">{DAYS.map((d, i) => <button key={d} onClick={() => setNewRule({...newRule, days: newRule.days.includes(i) ? newRule.days.filter(x=>x!==i) : [...newRule.days, i]})} className={`px-6 py-3 rounded-full border-2 font-black leading-none ${newRule.days.includes(i) ? 'bg-blue-600 border-blue-700 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}>{d}</button>)}</div>
                    <div className="grid grid-cols-4 md:grid-cols-8 gap-2 leading-none font-sans">{PERIODS.filter(p=>!p.isRest).map((p) => <button key={p.id} onClick={() => setNewRule({...newRule, periods: newRule.periods.includes(p.id) ? newRule.periods.filter(x=>x!==p.id) : [...newRule.periods, p.id]})} className={`py-3 rounded-xl border-2 font-black leading-none ${newRule.periods.includes(p.id) ? 'bg-[#1e40af] border-blue-700 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}>{p.label}</button>)}</div></div>
                  <button onClick={async () => { 
                    if(!newRule.desc || newRule.days.length===0 || newRule.periods.length===0) return alert('資訊不足'); 
                    const targetVal = newRule.type==='grade'?newRule.target:(newRule.type==='classes'?newRule.classList:'全校'); 
                    const updated = [...constraints, {...newRule, id:Date.now(), target:targetVal}];
                    setConstraints(updated); await setDoc(doc(db, "schools", currentSchool.id), { ...dbData, constraints: updated });
                    setNewRule({...newRule, desc:'', days:[], periods:[], target:'1', type:'grade'}); 
                  }} className="w-full py-6 bg-[#1e40af] text-white rounded-[2rem] font-black text-2xl shadow-2xl hover:bg-blue-900 transition-all leading-none font-serif">加入排課規則</button>
                </div>
              </div>
              <div className="space-y-4 mt-10 font-serif">
                <h4 className="text-base font-black text-slate-400 uppercase ml-4 tracking-widest leading-none font-sans">已啟用規則 ({constraints.length})</h4>
                {constraints.map(c => (
                  <div key={c.id} className="bg-white p-8 rounded-[2rem] border-2 border-slate-200 flex justify-between items-center shadow-lg group hover:border-blue-200 transition-all leading-none">
                    <div className="flex items-center gap-8 leading-none font-serif"><div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-inner shrink-0 leading-none"><Lock size={32}/></div>
                      <div className="leading-none"><div className="font-black text-2xl text-slate-800 leading-tight mb-2 font-serif">{c.desc}</div><div className="flex items-center gap-3 text-base font-bold text-[#1e40af] mt-2 bg-blue-50 px-4 py-1.5 rounded-full w-fit leading-none font-sans"><Globe size={18}/> 適用：{c.type === 'all' ? '全校' : (c.type === 'grade' ? `高 ${c.target} 全學年` : `班級(${c.target})`)} | {c.days.map(d=>DAYS[d]).join(', ')} / {c.periods.map(pId => PERIODS.find(p => p.id === pId)?.label).join(', ')}</div></div>
                    </div>
                    <button onClick={async () => {
                        const updated = constraints.filter(x=>x.id !== c.id);
                        setConstraints(updated); await setDoc(doc(db, "schools", currentSchool.id), { ...dbData, constraints: updated });
                    }} className="w-14 h-14 rounded-full flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500 transition-all active:scale-90 shrink-0"><Trash2 size={24}/></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-4 lg:p-8 flex flex-col min-h-0 overflow-hidden bg-slate-50">
            {isLoading ? <div className="flex-1 flex items-center justify-center text-2xl font-black text-slate-300 animate-pulse font-sans">連線中...</div> : 
            <div className="flex-1 bg-white rounded-[2.5rem] shadow-2xl border-2 border-slate-300 overflow-hidden flex flex-col font-serif">
              <div className="grid grid-cols-6 bg-[#1e293b] text-white shrink-0 border-b-2 border-slate-600 leading-none font-sans">
                <div className="p-4 text-center text-[11px] font-black border-r border-slate-600 uppercase tracking-widest leading-relaxed">節次</div>
                {DAYS.map(day => <div key={day} className="p-4 text-center font-black text-xl border-r border-slate-600 last:border-r-0 leading-relaxed tracking-wider">{day}</div>)}
              </div>
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {PERIODS.map(period => (
                  <div key={period.id} className={`grid grid-cols-6 border-b-2 border-slate-300 last:border-b-0 flex-1 min-h-0 ${period.isRest ? 'bg-slate-100 flex-none h-14' : ''}`}>
                    <div className="flex flex-col items-center justify-center border-r-2 border-slate-300 bg-slate-50/80 shrink-0 font-sans">
                      <span className="font-black text-slate-800 text-xl leading-none">{period.label}</span>
                      <span className="text-[10px] text-slate-500 font-bold mt-1 tracking-tighter leading-none">{period.time}</span>
                    </div>
                    {period.isRest ? <div className="col-span-5 flex items-center justify-center text-slate-400 text-sm font-black tracking-[3em] uppercase bg-slate-100/50 italic leading-none font-sans">午 休 時 間</div> : 
                      DAYS.map((_, dIdx) => {
                        const items = getCellData(dIdx, period.id);
                        const currentClassId = sidebarMode === 'class' ? selectedClass?.id : items[0]?.classId;
                        const lockRule = checkIsLocked(currentClassId, dIdx, period.id);
                        return (
                          <div key={dIdx} onDragOver={e => e.preventDefault()} onDrop={() => isEditMode && handleDrop(dIdx, period.id)} className={`border-r-2 border-slate-300 last:border-r-0 flex flex-col items-center justify-center text-center transition-all relative overflow-hidden ${lockRule ? 'bg-slate-50 cursor-not-allowed' : 'bg-white'} ${isEditMode && !lockRule ? 'hover:bg-blue-50/30' : ''}`}>
                            {lockRule && <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px'}}></div>}
                            {lockRule ? <div className="flex flex-col items-center gap-1 opacity-70 px-1 leading-tight shrink-0 font-serif"><Lock size={22} className="text-slate-500" /><span className="text-[12px] font-black text-slate-600 uppercase tracking-tighter truncate max-w-full leading-tight font-serif">{lockRule.desc}</span></div> : 
                              items.map((item, idx) => (
                                <div key={idx} draggable={isEditMode} onDragStart={() => setDraggedItem(item)} className={`w-full px-1 ${isEditMode ? 'cursor-grab active:cursor-grabbing hover:scale-105 transition-transform' : ''}`}>
                                  {sidebarMode === 'teacher' ? (
                                    <><div className="font-black text-blue-900 text-3xl tracking-tighter leading-none mb-1 font-sans">{item.classId!=="未知"?item.classId:""}</div><div className="px-3 py-1 bg-[#1e40af] text-white text-[11px] font-black rounded-lg shadow-sm inline-block uppercase truncate max-w-full leading-none font-serif">{item.subject}</div></>
                                  ) : (
                                    <><div className="font-black text-slate-800 text-3xl tracking-tight leading-none mb-1 truncate max-w-full font-serif leading-tight">{item.subject}</div><div className="px-3 py-1 bg-slate-800 text-white text-[11px] font-black rounded-lg shadow-sm inline-block truncate max-w-full leading-none font-sans mt-1">{item.teacherName}</div></>
                                  )}
                                </div>
                              ))
                            }
                          </div>
                        );
                      })
                    }
                  </div>
                ))}
              </div>
            </div>
            }
          </div>
        )}
      </main>

      {/* 調課分析報告 */}
      {proposals.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-white rounded-[3.5rem] p-12 max-w-xl w-full shadow-2xl border-4 border-[#1e40af] animate-in zoom-in duration-200 text-center">
            <div className="flex items-center gap-6 mb-10 leading-none">
              <div className="w-20 h-20 bg-blue-50 text-[#1e40af] rounded-3xl flex items-center justify-center shadow-inner leading-none shrink-0"><RefreshCw size={40} /></div>
              <div className="leading-none text-left"><h3 className="text-4xl font-black text-slate-800 tracking-tighter leading-tight mb-2 font-sans">智慧調課報告</h3><p className="text-slate-500 font-bold leading-tight text-lg font-sans">系統已完成衝突檢索</p></div>
            </div>
            <div className="space-y-6 mb-12 leading-none text-left font-serif">{proposals.map((p, i) => (
              <div key={i} className={`p-8 rounded-[2.5rem] border-2 flex items-start gap-6 transition-all ${p.disabled ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-blue-50/50 border-blue-200 shadow-sm hover:border-[#1e40af] hover:bg-blue-50 cursor-pointer group'}`}>
                {p.type === 'MOVE' ? <CheckCircle2 className="text-green-600 mt-1 shrink-0" size={32} /> : p.type === 'SWAP' ? <ArrowRightLeft className="text-[#1e40af] mt-1 shrink-0" size={32} /> : <XCircle className="text-red-600 mt-1 shrink-0" size={32} />}
                <div className="flex-1 leading-none font-serif">
                  <div className="flex justify-between items-center mb-3 leading-none font-serif"><span className="font-black text-2xl text-slate-800 leading-none font-sans">{p.title}</span><span className={`text-xs font-black px-3 py-1 rounded-full leading-none font-sans ${p.type==='MOVE'?'bg-green-100 text-green-700':'bg-blue-100 text-[#1e40af]'}`}>{p.impact}</span></div>
                  <p className="text-slate-600 font-bold text-lg leading-relaxed font-serif">{p.desc}</p>
                  {!p.disabled && <button onClick={p.action} className="mt-6 w-full bg-[#1e40af] text-white py-5 rounded-2xl font-black text-xl shadow-xl hover:bg-blue-900 flex items-center justify-center gap-3 leading-none font-sans">執行此方案 <ArrowRight size={24}/></button>}
                </div>
              </div>
            ))}</div>
            <button onClick={() => setProposals([])} className="text-slate-400 font-black text-xl hover:text-slate-600 transition-colors leading-none font-sans">放棄異動</button>
          </div>
        </div>
      )}
    </div>
  );
}