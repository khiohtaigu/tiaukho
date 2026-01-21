import './index.css';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom'; 
import { 
  Calendar, Search, ChevronDown, ChevronRight,
  RefreshCw, User, BookOpen, Layers,
  Settings, Lock, Plus, Trash2, Globe, CheckCircle2, XCircle, ArrowRightLeft, School, ArrowRight, X, MousePointerClick, Upload, GitBranch, Edit2, AlertCircle, Download, Camera, Monitor, ToggleRight, ToggleLeft, Zap, Clock, ListChecks
} from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

// 引入 Firebase
import { db } from './firebase';
import { doc, setDoc, onSnapshot, updateDoc } from "firebase/firestore";

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

const DOMAIN_SUB_ORDER = {
  '自然科': ['物理', '化學', '生物', '地球科學', '半導體', '自然'],
  '藝能科': ['音樂', '美術', '家政', '生活科技', '資訊科技', '健護', '體育', '全民國防', '輔導', '生命教育', '藝術生活', '藝能'],
  '社會科': ['歷史', '地理', '公民', '社會']
};

const SCHOOL_LIST = [{ id: 'fssh', name: '鳳山高級中學', password: 'fssh' }];

export default function MainSystem() {
  // ----------------------------------------------------------------
  // 1. Hooks & States
  // ----------------------------------------------------------------
  const currentYear = new Date().getFullYear();
  const [landingStage, setLandingStage] = useState(0); 
  const [currentSchool, setCurrentSchool] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [dbData, setDbData] = useState({ 
    teachers: [], schedules: [], classes: [], constraints: [], domainWarnings: [], 
    isApplyEnabled: true, isSimEnabled: true 
  });
  const [activeView, setActiveView] = useState('schedule'); 
  const [sidebarMode, setSidebarMode] = useState('teacher');
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditMode, setIsEditMode] = useState(false); 

  // 手動換課模式狀態
  const [isManualSwapMode, setIsManualSwapMode] = useState(false);
  const [swapQueue, setSwapQueue] = useState([]); 
  
  const [activeMainKey, setActiveMainKey] = useState(null); 
  const [activeSubKey, setActiveSubKey] = useState(null);
  const [gradeExpanded, setGradeExpanded] = useState({ '高1': true, '高2': true, '高3': true });
  
  const [constraints, setConstraints] = useState([]);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [newRule, setNewRule] = useState({ type: 'classes', target: '1', classList: '', days: [], periods: [], desc: '' });
  
  const [proposals, setProposals] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [previewProposal, setPreviewProposal] = useState(null);

  const exportRef = useRef(null);

  // ----------------------------------------------------------------
  // 2. 資料衍生運算
  // ----------------------------------------------------------------
  const schedules = useMemo(() => dbData?.schedules || [], [dbData]);
  const teachers = useMemo(() => [...(dbData?.teachers || [])].sort((a, b) => (a.order || 999) - (b.order || 999)), [dbData]);
  const classes = useMemo(() => dbData?.classes || [], [dbData]);

  const sidebarData = useMemo(() => {
    const data = { core: {}, domains: {} };
    SIDEBAR_ORDER.forEach(key => { 
        if (key.includes('科') || key === '本土語') data.domains[key] = {}; 
        else data.core[key] = []; 
    });
    data.core['本土語'] = [];

    teachers.forEach(t => {
      const targetBuckets = [];
      const teachesNativeInSchedule = schedules.some(s => s.teacherName === t.name && s.subject?.includes('本土語'));

      if (t.teachesNative || t.subject === '本土語' || teachesNativeInSchedule) {
        targetBuckets.push({ type: 'core', key: '本土語' });
      }

      if (t.subject === '音樂') targetBuckets.push({ type: 'domain', domain: '藝能科', sub: '音樂' });
      if (t.subject === '藝術與生活' || t.subject === '藝術生活') targetBuckets.push({ type: 'domain', domain: '藝能科', sub: '藝術生活' });

      if (['自然科', '社會科', '藝能科'].includes(t.domain)) {
        targetBuckets.push({ type: 'domain', domain: t.domain, sub: t.subject });
      } else {
        if (t.subject !== '本土語') targetBuckets.push({ type: 'core', key: t.subject });
      }

      Array.from(new Set(targetBuckets.map(JSON.stringify))).map(JSON.parse).forEach(b => {
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

    Object.keys(data.domains).forEach(domainKey => {
      const subOrder = DOMAIN_SUB_ORDER[domainKey] || [];
      const sortedSubs = {};
      subOrder.forEach(sub => { if (data.domains[domainKey][sub]) sortedSubs[sub] = data.domains[domainKey][sub]; });
      Object.keys(data.domains[domainKey]).forEach(sub => { if (!subOrder.includes(sub)) sortedSubs[sub] = data.domains[domainKey][sub]; });
      data.domains[domainKey] = sortedSubs;
    });
    return data;
  }, [teachers, schedules]);

  const groupedClasses = useMemo(() => {
    const groups = {};
    classes.forEach(c => {
      const grade = c.grade || "其他";
      if (!groups[grade]) groups[grade] = [];
      groups[grade].push(c);
    });
    return groups;
  }, [classes]);

  /**
   * getSlotWarning - 寫死固定規則版本
   */
  const getSlotWarning = (teacherName, dayIdx, periodId) => {
    if (!teacherName) return null;
    const teacher = teachers.find(t => String(t.name).trim() === String(teacherName).trim());
    if (!teacher) return null;
    
    const tDom = (teacher.domain || "").trim();
    const tSub = (teacher.subject || "").trim();
    const combinedInfo = tDom + tSub;

    // --- 1. 全校固定的輔導課：週一至週五 第 8 節 (程式內 ID 為 9) ---
    if (periodId === 9) return "輔導課";

    // --- 2. 寫死領域時間規則 ---
    
    // 週一 下午 5,6,7 節 (ID 6,7,8) -> 國文科
    if (dayIdx === 0 && [6, 7, 8].includes(periodId)) {
        if (combinedInfo.includes("國文")) return "領域時間";
    }

    // 週二 下午 5,6,7 節 (ID 6,7,8) -> 英文科
    if (dayIdx === 1 && [6, 7, 8].includes(periodId)) {
        if (combinedInfo.includes("英文")) return "領域時間";
    }

    // 週二 上午 1,2 節 (ID 1,2) -> 藝能科
    if (dayIdx === 1 && [1, 2].includes(periodId)) {
        const isArts = combinedInfo.includes("藝能") || 
                       ["音樂", "美術", "家政", "生活科技", "資訊科技", "健護", "體育", "輔導", "全民國防"].some(s => combinedInfo.includes(s));
        if (isArts) return "領域時間";
    }

    // 週四 上午 1,2,3,4 節 (ID 1,2,3,4) -> 自然科
    if (dayIdx === 3 && [1, 2, 3, 4].includes(periodId)) {
        if (combinedInfo.includes("自然") || ["物理", "化學", "生物", "地科", "地球科學"].some(s => combinedInfo.includes(s))) return "領域時間";
    }

    // 週四 下午 5,6,7 節 (ID 6,7,8) -> 數學科、社會科
    if (dayIdx === 3 && [6, 7, 8].includes(periodId)) {
        if (combinedInfo.includes("數學") || combinedInfo.includes("社會") || ["歷史", "地理", "公民"].some(s => combinedInfo.includes(s))) return "領域時間";
    }

    // --- 3. 團體活動 (這裡假設維持手動或資料庫，若也有固定時間可再加入) ---
    const dbWarning = dbData.domainWarnings?.find(w => 
        Number(w.day) === Number(dayIdx) && 
        Number(w.period) === Number(periodId) && 
        (w.domain?.includes("團體活動") || w.desc?.includes("團體活動"))
    );
    if (dbWarning) return "團體活動";

    return null;
  };

  useEffect(() => {
    if (!currentSchool) return;
    setIsLoading(true);
    const unsub = onSnapshot(doc(db, "schools", currentSchool.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDbData({
            ...data,
            isApplyEnabled: data.isApplyEnabled !== undefined ? data.isApplyEnabled : true,
            isSimEnabled: data.isSimEnabled !== undefined ? data.isSimEnabled : true
        });
        setConstraints(data.constraints || []);
      } else {
        setDbData({ teachers: [], schedules: [], classes: [], constraints: [], domainWarnings: [], isApplyEnabled: true, isSimEnabled: true });
      }
      setIsLoading(false);
    });
    return () => unsub();
  }, [currentSchool]);

  // ----------------------------------------------------------------
  // 3. 核心功能
  // ----------------------------------------------------------------
  
  const handleSaveAsImage = async () => {
    if (!exportRef.current) return;
    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        backgroundColor: "#f8fafc",
        useCORS: true,
      });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `${currentSchool.name}_${previewProposal ? previewProposal.letter : '模擬'}_調課分析.png`;
      link.click();
    } catch (err) { alert("另存圖片失敗，請重試"); }
  };

  const handleToggleState = async (field) => {
    if (!isAdmin) return;
    try {
        await updateDoc(doc(db, "schools", currentSchool.id), {
            [field]: !dbData[field]
        });
    } catch (e) { alert("更新開關失敗"); }
  };

  const checkIsLocked = (classId, dayIdx, periodId) => {
    if (!classId || classId === "未知") return null;
    const gradeLetter = classId.charAt(0);
    return constraints.find(rule => {
      if (!rule.days?.includes(dayIdx) || !rule.periods?.includes(periodId)) return false;
      if (rule.type === 'all') return true;
      if (rule.type === 'grade') return String(rule.target) === String(gradeLetter);
      const targetList = String(rule.target).split(/[,，、\s]+/).flatMap(part => {
          if (part.includes('-')) {
              const [start, end] = part.split('-').map(n => parseInt(n.trim()));
              if (!isNaN(start) && !isNaN(end)) return Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
          }
          return part.trim();
      });
      return targetList.includes(classId);
    });
  };

  const isSlotAvailable = (tName, cId, d, p, excludeIds = []) => {
    const tBusy = schedules.some(s => s.teacherName === tName && s.day === d && s.period === p && !excludeIds.includes(s.id));
    if (tBusy) return false;
    const cBusy = schedules.some(s => s.classId === cId && s.day === d && s.period === p && !excludeIds.includes(s.id));
    if (cBusy) return false;
    const locked = checkIsLocked(cId, d, p);
    if (locked) return false;
    return true;
  };

  const handleManualSlotClick = (dayIdx, periodId, item) => {
    if (!isManualSwapMode || !isAdmin) return;
    const existsIdx = swapQueue.findIndex(q => q.day === dayIdx && q.period === periodId);
    if (existsIdx !== -1) {
        setSwapQueue(swapQueue.filter((_, i) => i !== existsIdx));
    } else {
        setSwapQueue([...swapQueue, { day: dayIdx, period: periodId, item: item || null }]);
    }
  };

  const executeManualSwap = async () => {
    if (swapQueue.length < 2) return alert("請至少選擇兩個時段進行調動。");
    const nextSchedules = [...schedules];
    const affectedIds = swapQueue.filter(q => q.item).map(q => q.item.id);

    for (let i = 0; i < swapQueue.length; i++) {
        const source = swapQueue[i];
        const target = swapQueue[(i + 1) % swapQueue.length]; 
        if (source.item) {
            const tName = source.item.teacherName;
            const cId = source.item.classId;
            if (!isSlotAvailable(tName, cId, target.day, target.period, affectedIds)) {
                return alert(`調動失敗：${tName} 老師 或 班級 ${cId} 在 ${DAYS[target.day]} 第${target.period}節 有衝突。`);
            }
        }
    }

    swapQueue.forEach((source, i) => {
        const target = swapQueue[(i + 1) % swapQueue.length];
        if (source.item) {
            const idx = nextSchedules.findIndex(s => s.id === source.item.id);
            if (idx !== -1) {
                nextSchedules[idx] = { ...nextSchedules[idx], day: target.day, period: target.period };
            }
        }
    });

    try {
        setDbData(prev => ({ ...prev, schedules: nextSchedules }));
        await setDoc(doc(db, "schools", currentSchool.id), { ...dbData, schedules: nextSchedules });
        alert("調動完成！");
        setSwapQueue([]);
        setIsManualSwapMode(false);
    } catch (e) { alert("更新資料庫失敗"); }
  };

  const analyzeMove = (source, targetDay, targetPeriod) => {
    const srcDay = source.day; const srcPeriod = source.period; const teacherA = source.teacherName;
    const options = [];
    const occupantInTarget = schedules.find(s => s.classId === source.classId && s.day === targetDay && s.period === targetPeriod);

    if (!occupantInTarget && isSlotAvailable(teacherA, source.classId, targetDay, targetPeriod, [source.id])) {
        options.push({
            type: 'MOVE', title: '直接移動', color: 'blue', impact: '雙方皆空堂',
            actions: [{ id: source.id, d: targetDay, p: targetPeriod, t: teacherA, c: source.classId, oldD: srcDay, oldP: srcPeriod }]
        });
    } else if (occupantInTarget) {
      const teacherB = occupantInTarget.teacherName;
      if (teacherA !== teacherB) {
        const canAToTarget = isSlotAvailable(teacherA, source.classId, targetDay, targetPeriod, [source.id, occupantInTarget.id]);
        const canBToSource = isSlotAvailable(teacherB, source.classId, srcDay, srcPeriod, [source.id, occupantInTarget.id]);
        if (canAToTarget && canBToSource) {
            options.push({
                type: 'SWAP', title: '兩課互換 (Swap)', color: 'indigo', impact: '精確對調',
                actions: [
                  { id: source.id, d: targetDay, p: targetPeriod, t: teacherA, c: source.classId, oldD: srcDay, oldP: srcPeriod },
                  { id: occupantInTarget.id, d: srcDay, p: srcPeriod, t: teacherB, c: occupantInTarget.classId, oldD: targetDay, oldP: targetPeriod }
                ]
            });
        }
      }
      schedules.forEach(cItem => {
          if (cItem.classId !== source.classId) return; 
          const teacherC = cItem.teacherName;
          if (teacherA === teacherB || teacherB === teacherC || teacherA === teacherC) return;
          if (cItem.id === source.id || cItem.id === occupantInTarget.id) return;
          const leg1 = isSlotAvailable(teacherA, source.classId, targetDay, targetPeriod, [source.id, occupantInTarget.id, cItem.id]);
          const leg2 = isSlotAvailable(teacherB, source.classId, cItem.day, cItem.period, [source.id, occupantInTarget.id, cItem.id]);
          const leg3 = isSlotAvailable(teacherC, source.classId, srcDay, srcPeriod, [source.id, occupantInTarget.id, cItem.id]);
          if (leg1 && leg2 && leg3) {
              options.push({
                  type: 'TRIANGLE', title: '三角調動 (Triangle)', color: 'purple', impact: `班級 ${source.classId} 內部循環`,
                  actions: [
                    { id: source.id, d: targetDay, p: targetPeriod, t: teacherA, c: source.classId, oldD: srcDay, oldP: srcPeriod },
                    { id: occupantInTarget.id, d: cItem.day, p: cItem.period, t: teacherB, c: occupantInTarget.classId, oldD: targetDay, oldP: targetPeriod },
                    { id: cItem.id, d: srcDay, p: srcPeriod, t: teacherC, c: cItem.classId, oldD: cItem.day, oldP: cItem.period }
                  ]
              });
          }
      });
    }
    if (options.length === 0) options.push({ type: 'CONFLICT', title: '無方案', impact: '違反規則', color: 'red', disabled: true });
    setProposals(options);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const newSchedules = []; const newTeachers = []; const newConstraints = [];
        const newDomainWarnings = []; 
        const teacherCache = {}; const classSet = new Set(); const scheduleCheck = new Set();
        const nativeTeachersNames = new Set();
        const dayMap = { '週一': 0, '週二': 1, '週三': 2, '週四': 3, '週五': 4 };
        const periodLabelMap = { '第1節': 1, '第2節': 2, '第3節': 3, '第4節': 4, '第5節': 6, '第6節': 7, '第7節': 8, '第8節': 9 };
        const periodMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 7, 7: 8, 8: 9 };
        
        workbook.SheetNames.forEach(sheetName => {
          const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          if (sheetName.includes("本土語")) json.forEach(r => { if(r['老師姓名']) nativeTeachersNames.add(String(r['老師姓名']).trim()); });
          if (sheetName === "領域時間") {
            json.forEach(row => {
                const domain = String(row['領域'] || '').trim();
                const d = dayMap[String(row['星期']).trim()];
                const p = periodLabelMap[String(row['節次']).trim()];
                if (domain && d !== undefined && p !== undefined) {
                    newDomainWarnings.push({ domain, day: d, period: p, desc: (domain === "導師" || domain === "團體活動" || domain === "輔導課") ? domain : "領域時間" });
                }
            });
          } else if (sheetName === "禁區設定") {
            json.forEach((row, idx) => {
              const typeRaw = String(row['類型'] || ''); if (!typeRaw) return;
              let type = 'classes'; let target = typeRaw;
              if (typeRaw.includes('全校')) type = 'all';
              else if (typeRaw.includes('高一全') || typeRaw === '高一') { type = 'grade'; target = '1'; }
              else if (typeRaw.includes('高二全') || typeRaw === '高二') { type = 'grade'; target = '2'; }
              else if (typeRaw.includes('高三全') || typeRaw === '高三') { type = 'grade'; target = '3'; }
              newConstraints.push({ id: `C${idx}-${Date.now()}`, type, target: String(target), days: [dayMap[String(row['星期']).trim()] ?? 0], periods: [periodLabelMap[String(row['節次']).trim()] ?? 1], desc: String(row['說明'] || '') });
            });
          } else {
            json.forEach(row => {
              const tName = String(row['老師姓名'] || '').trim(); if (!tName || tName === 'nan') return;
              if (!teacherCache[tName]) {
                const adminRole = String(row['行政職稱'] || '');
                teacherCache[tName] = { id: `T${newTeachers.length+1}`, name: tName, order: parseInt(row['編號'])||999, domain: String(row['領域']||''), subject: String(row['學科']||''), adminRole: adminRole==='nan'?'':adminRole, isAdjunct: adminRole.includes('兼課'), isHomeroom: row['是否導師']==='是', teachesNative: nativeTeachersNames.has(tName) };
                newTeachers.push(teacherCache[tName]);
              }
              const d = dayMap[String(row['星期'])]; const p = periodMap[Number(row['節次'])];
              if (d!==undefined && p!==undefined) {
                const key = `${tName}-${d}-${p}`;
                if (!scheduleCheck.has(key)) {
                  const cId = String(row['班級']||'').trim(); if (cId && cId !== '未知' && cId !== 'nan') classSet.add(cId);
                  newSchedules.push({ id: `S${newSchedules.length}`, teacherName: tName, classId: cId, subject: String(row['表原始名稱'] || row['課表原始名稱'] || '課程'), day: d, period: p });
                  scheduleCheck.add(key);
                }
              }
            });
          }
        });
        const finalClasses = Array.from(classSet).sort().map(c => ({ id: c, name: `${c}班`, grade: `高${c[0]}` }));
        await setDoc(doc(db, "schools", currentSchool.id), { teachers: newTeachers, schedules: newSchedules, classes: finalClasses, constraints: newConstraints, domainWarnings: newDomainWarnings, isApplyEnabled: true, isSimEnabled: true });
        alert("資料已更新！");
      } catch (err) { alert("讀取 Excel 失敗"); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileExport = () => {
    try {
      const teacherRows = teachers.map(t => ({ '編號': t.order || '', '老師姓名': t.name, '領域': t.domain, '學科': t.subject, '行政職稱': t.adminRole || '', '是否導師': t.isHomeroom ? '是' : '否' }));
      const revMap = { 1: 1, 2: 2, 3: 3, 4: 4, 6: 5, 7: 6, 8: 7, 9: 8 };
      const scheduleRows = schedules.map(s => ({ '老師姓名': s.teacherName, '班級': s.classId, '星期': DAYS[s.day], '節次': revMap[s.period] || '', '表原始名稱': s.subject }));
      const constraintRows = constraints.map(c => {
          let typeStr = c.target;
          if (c.type === 'all') typeStr = '全校';
          else if (c.type === 'grade') typeStr = `高${c.target}全`;
          return { '類型': typeStr, '星期': DAYS[c.days[0]] || '', '節次': PERIODS.find(p => p.id === c.periods[0])?.label || '', '說明': c.desc };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teacherRows), "教師名單");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheduleRows), "課表資料");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(constraintRows), "禁區設定");
      XLSX.writeFile(wb, `${currentSchool?.name || '學校'}_備份_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) { alert("匯出失敗"); }
  };

  const handleAdminLogin = () => {
    if (loginPassword === SCHOOL_LIST[0].password) { setIsAdmin(true); setCurrentSchool(SCHOOL_LIST[0]); setShowLoginModal(false); setLandingStage(2); }
    else alert("密碼錯誤");
  };

  const handleDrop = (targetDay, targetPeriod) => {
    if (!draggedItem || !isEditMode) return;
    const lockInfo = checkIsLocked(draggedItem.classId, targetDay, targetPeriod);
    if (lockInfo) return alert(`無法調動：此時段為「${lockInfo.desc}」禁區。`);
    analyzeMove(draggedItem, targetDay, targetPeriod);
  };

  const executeFinalAdopt = async () => {
    if (!isAdmin) return; 
    const moves = previewProposal.actions;
    setPreviewProposal(null); setProposals([]); 
    const nextSchedules = [...schedules];
    moves.forEach(m => { const idx = nextSchedules.findIndex(s => s.id === m.id); if (idx !== -1) nextSchedules[idx] = { ...nextSchedules[idx], day: m.d, period: m.p }; });
    setDbData(prev => ({ ...prev, schedules: nextSchedules }));
    setIsEditMode(false);
    try { await setDoc(doc(db, "schools", currentSchool.id), { ...dbData, schedules: nextSchedules, constraints: constraints }); } catch (e) { alert("失敗"); }
  };

  const toggleMain = (key) => { setActiveMainKey(prev => prev === key ? null : key); setActiveSubKey(null); };
  const toggleSub = (e, key) => { e.stopPropagation(); setActiveSubKey(prev => prev === key ? null : key); };

  const getCellDataFn = (dayIdx, periodId) => {
    if (sidebarMode === 'teacher' && selectedTeacher) return schedules.filter(s => s.teacherName === selectedTeacher.name && s.day === dayIdx && s.period === periodId).slice(0, 1);
    if (sidebarMode === 'class' && selectedClass) return schedules.filter(s => s.classId === selectedClass.id && s.day === dayIdx && s.period === periodId).slice(0, 1);
    return [];
  };

  const handleCellDoubleClick = (item) => {
    if (isManualSwapMode) return; 
    if (sidebarMode === 'teacher') {
      const targetClass = classes.find(c => c.id === item.classId);
      if (targetClass) { setSidebarMode('class'); setSelectedClass(targetClass); setSelectedTeacher(null); setActiveView('schedule'); }
    } else {
      const targetTeacher = teachers.find(t => t.name === item.teacherName);
      if (targetTeacher) { setSidebarMode('teacher'); setSelectedTeacher(targetTeacher); setSelectedClass(null); setActiveView('schedule'); }
    }
  };

  const toggleNewRuleSlot = (d, p) => {
      const isExist = newRule.days.some((day, idx) => day === d && newRule.periods[idx] === p);
      if (isExist) {
          const newDays = []; const newPeriods = [];
          newRule.days.forEach((day, idx) => {
              if (day !== d || newRule.periods[idx] !== p) {
                  newDays.push(day); newPeriods.push(newRule.periods[idx]);
              }
          });
          setNewRule({ ...newRule, days: newDays, periods: newPeriods });
      } else {
          setNewRule({ ...newRule, days: [...newRule.days, d], periods: [...newRule.periods, p] });
      }
  };

  // ----------------------------------------------------------------
  // 4. 元件渲染
  // ----------------------------------------------------------------

  const TeacherItem = ({ t }) => (
    <button onClick={() => { setSelectedTeacher(t); setSelectedClass(null); setActiveView('schedule'); }} className={`w-full text-left px-4 py-3 text-lg flex items-center justify-between transition-all rounded-md mb-1 ${selectedTeacher?.id === t.id ? 'bg-blue-800 text-white font-black shadow-lg scale-[1.02]' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800 font-bold'}`}>
      <div className="flex items-center gap-2 truncate font-serif text-lg leading-none">
        <span className="break-all text-slate-900 font-black">{t.name}</span>
        {t.adminRole && t.adminRole !== "兼課" && <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedTeacher?.id === t.id ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'}`}>{t.adminRole}</span>}
        {t.isAdjunct && <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedTeacher?.id === t.id ? 'bg-white text-slate-700' : 'bg-slate-500 text-white'}`}>兼</span>}
        {t.isHomeroom && <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedTeacher?.id === t.id ? 'bg-white text-orange-600' : 'bg-orange-500 text-white'}`}>導</span>}
      </div>
    </button>
  );

  const PreviewGrid = ({ teacherName, moves }) => {
    return (
      <div className="bg-white rounded-2xl border-2 border-slate-400 overflow-hidden shadow-sm font-sans flex-1 text-slate-900">
        <div className="bg-[#475569] p-2 font-black text-center text-white border-b-2 border-slate-400 flex items-center justify-center gap-2">
            <User size={16} className="text-white"/> <span className="text-base font-serif font-black text-white">{teacherName} 老師</span>
        </div>
        <div className="grid grid-cols-6 bg-slate-100 text-sm font-black border-b border-slate-400">
          <div className="p-1 border-r border-slate-400 text-center text-slate-500">節</div>
          {DAYS.map(d => <div key={d} className="p-1 text-center border-r border-slate-400 last:border-r-0 text-slate-800">{d[1]}</div>)}
        </div>
        {PERIODS.map(p => (
          <div key={p.id} className={`grid grid-cols-6 border-b border-slate-400 last:border-b-0 ${p.isRest ? 'h-4 bg-slate-50' : 'h-11'}`}>
            <div className="text-sm flex items-center justify-center border-r border-slate-400 bg-slate-50 font-black text-slate-700 leading-none">
              {p.isRest ? '' : p.label.replace(/[^0-9]/g, '')}
            </div>
            {!p.isRest && DAYS.map((_, dIdx) => {
              const originalItem = schedules.find(s => s.teacherName === teacherName && s.day === dIdx && s.period === p.id);
              const moveOut = moves.find(m => m.t === teacherName && m.oldD === dIdx && m.oldP === p.id);
              const moveIn = moves.find(m => m.t === teacherName && m.d === dIdx && m.p === p.id);
              const warning = moveIn ? getSlotWarning(teacherName, dIdx, p.id) : null;
              let bgColor = "bg-white"; let content = "";
              if (moveOut) { bgColor = "bg-red-50"; content = <XCircle size={14} className="text-red-400"/>; }
              else if (moveIn) { 
                bgColor = "bg-green-100 ring-2 ring-green-500 ring-inset"; 
                content = (
                  <div className="flex flex-col items-center justify-center leading-none text-slate-900">
                    <span className="font-black text-green-900 text-base">{moveIn.c}</span>
                    <span className="text-[10px] text-green-700 font-black scale-90 mt-0.5 font-sans">新入</span>
                    {warning && <span className="text-[9px] text-red-600 font-black scale-90 leading-none mt-0.5">{warning}</span>}
                  </div>
                ); 
              }
              else if (originalItem) { content = <span className="text-slate-700 font-black text-xs">{originalItem.classId}</span>; }
              return <div key={dIdx} className={`border-r border-slate-400 last:border-r-0 flex items-center justify-center text-center ${bgColor}`}>{content}</div>;
            })}
            {p.isRest && <div className="col-span-5 flex items-center justify-center text-[8px] text-slate-300 tracking-widest font-bold uppercase">Rest</div>}
          </div>
        ))}
      </div>
    );
  };

  if (landingStage === 0) {
    return (
      <div className="flex flex-col h-screen w-full bg-[#fdfaf1] items-center justify-center overflow-hidden font-serif text-slate-900">
        <div className="bg-white rounded-[4rem] shadow-2xl border-[6px] border-[#fbda8b] p-20 text-center animate-in zoom-in duration-700 max-w-4xl w-[90%]">
          <h1 className="text-9xl font-black text-[#1e3a8a] mb-10 tracking-tighter leading-none font-sans">天才小調手</h1>
          <p className="text-4xl font-bold text-[#3b82f6] tracking-[0.25em] mb-16 uppercase leading-none font-sans">智慧調課系統</p>
          <button onClick={() => setLandingStage(1)} className="bg-[#fbda8b] hover:bg-[#f9cf6a] text-[#1e3a8a] px-14 py-7 rounded-[2.5rem] text-4xl font-black shadow-xl transition-all flex items-center gap-5 mx-auto active:scale-95 font-sans font-black">點擊進入 <ArrowRight size={40} /></button>
        </div>
        <div className="mt-12 text-slate-400 font-bold text-base tracking-widest uppercase font-sans">© {currentYear} 天才小調手 X 耀毅. All Rights Reserved.</div>
      </div>
    );
  }

  if (landingStage === 1) {
    return (
      <div className="flex flex-col h-screen w-full bg-[#f1f5f9] items-center justify-center overflow-hidden font-sans text-slate-900">
        <div className="bg-white rounded-[3.5rem] shadow-2xl border-2 border-slate-200 p-16 text-center animate-in slide-in-from-bottom-8 duration-700 max-w-lg w-full mx-4 relative overflow-hidden font-black">
          <div className="absolute top-0 left-0 w-full h-3 bg-[#1e40af]"></div>
          <School size={80} className="mx-auto text-[#1e3a8a] mb-8 mt-4" />
          <h3 className="text-5xl font-black text-slate-800 mb-12 tracking-tight font-serif text-slate-900">鳳山高級中學</h3>
          <div className="flex flex-col gap-6 font-black">
            <button onClick={() => { setIsAdmin(false); setCurrentSchool(SCHOOL_LIST[0]); setLandingStage(2); }} className="w-full bg-[#1e40af] text-white py-6 rounded-3xl font-black text-2xl hover:bg-blue-900 transition-all shadow-xl active:scale-[0.98]">直接進入 (檢視用)</button>
            <button onClick={() => setShowLoginModal(true)} className="w-full bg-white text-[#1e40af] border-4 border-[#1e40af] py-6 rounded-3xl font-black text-2xl hover:bg-blue-50 transition-all active:scale-[0.98]">管理員登入</button>
          </div>
          <button onClick={() => setLandingStage(0)} className="mt-10 text-slate-400 font-bold text-lg hover:text-slate-600 transition-colors flex items-center justify-center gap-2 mx-auto">← 返回首頁</button>
        </div>
        {showLoginModal && (
            <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-in fade-in duration-300 font-black text-slate-900">
                <div className="bg-white rounded-[3rem] p-12 max-w-md w-full shadow-2xl border-4 border-[#1e40af] relative">
                    <button onClick={() => setShowLoginModal(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-600 font-black"><X size={32}/></button>
                    <div className="w-20 h-20 bg-blue-100 text-[#1e40af] rounded-3xl flex items-center justify-center mb-8 mx-auto"><Lock size={40}/></div>
                    <h3 className="text-3xl font-black text-center text-slate-800 mb-4 font-serif text-slate-900">管理員驗證</h3>
                    <input type="password" autoFocus className="w-full p-5 bg-slate-100 rounded-2xl border-none text-center text-2xl font-black focus:ring-4 mb-8 text-slate-900" placeholder="••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()} />
                    <button onClick={handleAdminLogin} className="w-full bg-[#1e40af] text-white py-5 rounded-2xl font-black text-xl hover:bg-blue-900 font-serif font-black">確認登入</button>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#f1f5f9] text-slate-900 overflow-hidden font-serif font-black">
      <aside className="w-80 bg-white border-r border-slate-300 flex flex-col shadow-xl z-20 shrink-0 font-sans text-slate-900">
        <div className="p-6 bg-[#1e3a8a] text-white shrink-0 font-black">
          <button onClick={() => { setLandingStage(1); setSelectedTeacher(null); setSelectedClass(null); }} className="text-xs font-black uppercase tracking-widest text-slate-300 hover:text-white flex items-center gap-1 mb-2 transition-colors underline underline-offset-4 leading-none text-slate-300 font-sans">← 切換學校</button>
          <h1 className="text-2xl font-black flex items-center gap-2 tracking-tight leading-tight font-serif text-white"><Calendar size={28} className="text-white"/> {currentSchool?.name}</h1>
        </div>
        <div className="flex p-2 bg-slate-100 border-b border-slate-300 shrink-0 text-slate-900">
          <button onClick={() => setSidebarMode('teacher')} className={`flex-1 py-3 rounded-lg text-base font-black transition-all ${sidebarMode === 'teacher' ? 'bg-white shadow-md text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}>教師列表</button>
          <button onClick={() => setSidebarMode('class')} className={`flex-1 py-3 rounded-lg text-base font-black transition-all ${sidebarMode === 'class' ? 'bg-white shadow-md text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}>班級列表</button>
        </div>
        <div className="p-4 border-b border-slate-300 bg-white shrink-0 text-slate-900 font-sans"><div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={20} /><input type="text" placeholder="搜尋..." className="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-xl text-base font-bold outline-none placeholder-slate-400 text-slate-900" onChange={(e) => setSearchTerm(e.target.value)} /></div></div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-white text-slate-900 font-serif">
          {sidebarMode === 'teacher' ? (
            <div className="space-y-2 pb-10">
              {SIDEBAR_ORDER.map(key => {
                const members = sidebarData.core[key]; const domains = sidebarData.domains[key];
                if (members) {
                  const filtered = members.filter(m => m.name.includes(searchTerm));
                  if (filtered.length === 0 && searchTerm) return null;
                  const isExpanded = activeMainKey === key || searchTerm !== '';
                  return (
                    <div key={key}>
                      <button onClick={() => toggleMain(key)} className="w-full flex items-center justify-between p-4 hover:bg-slate-100 rounded-xl group font-black text-lg text-slate-800 leading-none text-slate-900"><div className="flex items-center gap-3"><BookOpen size={20} className="text-blue-600"/>{key === '本土語' ? key : key + '科'}</div>{isExpanded ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}</button>
                      {isExpanded && <div className="ml-7 border-l-2 border-slate-200 pl-3 mt-1">{filtered.map(t => <TeacherItem key={t.id} t={t}/>)}</div>}
                    </div>
                  );
                }
                if (domains) {
                  const isExpanded = activeMainKey === key || searchTerm !== '';
                  return (
                    <div key={key} className="mb-2 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                      <button onClick={() => toggleMain(key)} className="w-full flex items-center justify-between p-4 bg-slate-100/80 hover:bg-slate-200 transition-colors leading-none font-black text-lg text-indigo-900"><div className="flex items-center gap-3"><Layers size={20} className="text-indigo-600"/>{key}</div>{isExpanded ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}</button>
                      {isExpanded && <div className="p-2 space-y-1">{Object.entries(domains).map(([sub, subMembers]) => {
                        const isSubExp = activeSubKey === (key + sub) || searchTerm !== '';
                        const filteredSub = subMembers.filter(m => m.name.includes(searchTerm));
                        if (filteredSub.length === 0 && searchTerm) return null;
                        return (<div key={sub}><button onClick={(e) => toggleSub(e, key + sub)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white rounded-xl text-base font-black text-slate-600 shadow-sm border border-transparent leading-none text-slate-900"><span>{sub}</span>{isSubExp ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}</button>
                          {isSubExp && <div className="ml-4 border-l-2 border-slate-200 pl-2 mt-1 text-slate-900">{filteredSub.map(t => <TeacherItem key={t.id} t={t}/>)}</div>}</div>);
                      })}</div>}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ) : (
            <div className="space-y-4 p-1 pb-10">
              {Object.entries(groupedClasses).map(([grade, list]) => (
                <div key={grade} className="mb-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden text-slate-900">
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
          <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 flex flex-col gap-2 text-slate-900">
            <button onClick={handleFileExport} className="flex items-center gap-3 px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl cursor-pointer hover:border-green-500 hover:bg-green-50 group shadow-sm leading-none text-slate-900 font-sans">
              <Download className="text-slate-400 group-hover:scale-110 transition-all" size={24} />
              <span className="font-black text-slate-600">配課表匯出</span>
            </button>
            <label className="flex items-center gap-3 px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 group shadow-sm leading-none text-slate-900 font-sans">
              <Settings className="text-slate-400 group-hover:rotate-90 transition-all" size={24} />
              <span className="font-black text-slate-600">配課表匯入</span>
              <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 text-slate-900 font-serif">
        <header className="h-24 bg-white border-b-2 border-slate-200 flex items-center justify-between px-10 shadow-sm shrink-0 z-10 font-sans">
          <div className="flex items-center gap-6 leading-none">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl ${sidebarMode === 'teacher' ? (selectedTeacher?.isAdjunct ? 'bg-slate-700' : 'bg-blue-900') : 'bg-blue-800'}`}><User size={32} className="text-white"/></div>
            <div className="leading-tight font-serif"><h2 className="text-3xl font-black text-slate-900 tracking-tight mb-1 leading-none">{sidebarMode === 'teacher' ? (selectedTeacher?.name || '請由左側選擇') : (selectedClass?.name || '請由左側選擇')} 的週課表</h2><span className="text-blue-600 font-bold text-base">{sidebarMode === 'teacher' ? (selectedTeacher?.subject ? `${selectedTeacher.subject}科` : '') : (selectedClass?.grade || '')}</span></div>
          </div>
          <div className="flex gap-3 leading-none text-slate-900 font-sans">
            {(isAdmin || dbData.isSimEnabled) && (
                <button 
                    onClick={() => (isAdmin || dbData.isSimEnabled) && setIsEditMode(!isEditMode)} 
                    disabled={!isAdmin && !dbData.isSimEnabled}
                    className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all border-2 flex items-center gap-2 leading-none ${
                        isEditMode 
                            ? 'bg-purple-600 text-white border-purple-700 shadow-lg animate-pulse' 
                            : (!isAdmin && !dbData.isSimEnabled)
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    {(!isAdmin && !dbData.isSimEnabled) && <Lock size={16} />}
                    {isAdmin ? (isEditMode ? '停止調課' : '智慧調課') : (isEditMode ? '停止模擬' : '模擬調課')}
                </button>
            )}

            {isAdmin && sidebarMode === 'class' && (
                <button 
                    onClick={() => { setIsManualSwapMode(!isManualSwapMode); setSwapQueue([]); }}
                    className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all border-2 flex items-center gap-2 leading-none ${
                        isManualSwapMode ? 'bg-green-600 text-white border-green-700 shadow-lg' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <ListChecks size={18} />
                    {isManualSwapMode ? '取消手動調動' : '班級課表調動'}
                </button>
            )}
            
            <button onClick={() => setActiveView('schedule')} className={`px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 leading-none ${activeView === 'schedule' ? 'bg-[#1e40af] text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><BookOpen size={18}/> 檢視課表</button>
            {isAdmin && <button onClick={() => setActiveView(activeView === 'settings' ? 'schedule' : 'settings')} className={`px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 leading-none ${activeView === 'settings' ? 'bg-[#1e40af] text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><Settings size={18}/>排課設定</button>}
          </div>
        </header>

        {isManualSwapMode && (
            <div className="bg-green-50 border-b border-green-200 px-10 py-3 flex items-center justify-between animate-in slide-in-from-top-4 duration-300 font-sans">
                <div className="flex items-center gap-4 text-green-800 font-black text-lg">
                    <Zap className="text-green-600 animate-pulse" />
                    <span>手動路徑模式：請點選課程設定順序 ① → ② → ③ ... 完成後點擊右側按鈕。</span>
                    <span className="bg-green-200 px-3 py-1 rounded-full text-sm">已選取：{swapQueue.length} 站</span>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => { setIsManualSwapMode(false); setSwapQueue([]); }} className="px-6 py-2 bg-slate-200 text-slate-600 rounded-xl font-black hover:bg-slate-300 transition-all font-sans">取消</button>
                    <button onClick={executeManualSwap} className="px-8 py-2 bg-green-600 text-white rounded-xl font-black hover:bg-green-700 shadow-lg transition-all flex items-center gap-2 font-sans font-black"><CheckCircle2 size={20}/> 完成調動</button>
                </div>
            </div>
        )}

        {activeView === 'settings' ? (
          <div className="flex-1 p-10 overflow-y-auto bg-slate-50 custom-scrollbar pb-32 font-sans text-slate-900">
            <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-900">
                <div className="bg-white rounded-[2rem] shadow-xl border-2 border-slate-200 p-8 relative flex flex-col gap-6 overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-3 bg-purple-600"></div>
                    <div className="flex items-center justify-between text-slate-900">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${dbData.isApplyEnabled ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-400'}`}>
                            <Edit2 size={28} />
                        </div>
                        <button onClick={() => handleToggleState('isApplyEnabled')} className={`p-1 rounded-full transition-all w-24 relative ${dbData.isApplyEnabled ? 'bg-purple-600' : 'bg-slate-300'}`}>
                            <div className={`w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center transform transition-transform ${dbData.isApplyEnabled ? 'translate-x-12' : 'translate-x-0'}`}>
                                {dbData.isApplyEnabled ? <ToggleRight className="text-purple-600" /> : <ToggleLeft className="text-slate-400" />}
                            </div>
                        </button>
                    </div>
                    <div className="text-slate-900 font-sans">
                        <h3 className="text-2xl font-black flex items-center gap-2 font-serif text-slate-900">填報功能管理 {dbData.isApplyEnabled ? <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-sans">開放</span> : <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-sans">關閉</span>}</h3>
                        <p className="text-slate-400 font-bold text-sm mt-1 leading-relaxed font-sans">控制一般老師是否能進入「自主調課表」填報頁面。</p>
                    </div>
                </div>
                <div className="bg-white rounded-[2rem] shadow-xl border-2 border-slate-200 p-8 relative flex flex-col gap-6 overflow-hidden text-slate-900 font-sans">
                    <div className="absolute left-0 top-0 bottom-0 w-3 bg-blue-600"></div>
                    <div className="flex items-center justify-between text-slate-900">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${dbData.isSimEnabled ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                            <Zap size={28} />
                        </div>
                        <button onClick={() => handleToggleState('isSimEnabled')} className={`p-1 rounded-full transition-all w-24 relative ${dbData.isSimEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}>
                            <div className={`w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center transform transition-transform ${dbData.isSimEnabled ? 'translate-x-12' : 'translate-x-0'}`}>
                                {dbData.isSimEnabled ? <ToggleRight className="text-blue-600" /> : <ToggleLeft className="text-slate-400" />}
                            </div>
                        </button>
                    </div>
                    <div className="text-slate-900 font-sans">
                        <h3 className="text-2xl font-black flex items-center gap-2 font-serif text-slate-900">模擬功能管理 {dbData.isSimEnabled ? <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-sans">開放</span> : <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-sans">鎖定</span>}</h3>
                        <p className="text-slate-400 font-bold text-sm mt-1 leading-relaxed font-sans text-slate-400">關閉後，一般老師的「模擬調課」按鈕將會鎖定。</p>
                    </div>
                </div>
              </div>
              <div id="rule-form" className="bg-white rounded-[2rem] shadow-xl border-2 border-slate-200 p-10 relative text-slate-900 font-serif">
                <h3 className="text-3xl font-black text-slate-800 flex items-center gap-3 mb-10 leading-none font-serif">{editingRuleId ? <Edit2 size={32} className="text-orange-600"/> : <Plus size={32} className="text-blue-600"/>} {editingRuleId ? '修改排課禁區規則' : '新增排課禁區規則'}</h3>
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="text-slate-900 font-sans">
                      <label className="block text-sm font-black text-slate-400 mb-4 tracking-widest uppercase text-slate-400">適用範圍</label>
                      <div className="flex gap-2">
                        <button onClick={() => setNewRule({...newRule, type:'all'})} className={`flex-1 py-4 rounded-xl border-2 font-black leading-none ${newRule.type==='all'?'bg-blue-50 border-blue-600 text-blue-700':'bg-white border-slate-100 text-slate-400'}`}>全校</button>
                        <button onClick={() => setNewRule({...newRule, type:'grade'})} className={`flex-1 py-4 rounded-xl border-2 font-black leading-none ${newRule.type==='grade'?'bg-blue-50 border-blue-600 text-blue-700':'bg-white border-slate-100 text-slate-400'}`}>特定年級</button>
                        <button onClick={() => setNewRule({...newRule, type:'classes'})} className={`flex-1 py-4 rounded-xl border-2 font-black leading-none ${newRule.type==='classes'?'bg-blue-50 border-blue-600 text-blue-700':'bg-white border-slate-100 text-slate-400'}`}>特定班級</button>
                      </div>
                      <div className="mt-4 font-sans">
                        {newRule.type === 'grade' && <select className="w-full p-4 bg-slate-100 rounded-xl border-none font-black text-lg text-slate-900 font-sans" value={newRule.target} onChange={e=>setNewRule({...newRule, target:e.target.value})}><option value="1">高一年級</option><option value="2">高二年級</option><option value="3">高三年級</option></select>}
                        {newRule.type === 'classes' && <input type="text" placeholder="例如: 201、202-205" className="w-full p-4 bg-slate-100 rounded-xl border-none font-black text-lg text-slate-900 font-sans" value={newRule.classList} onChange={e=>setNewRule({...newRule, classList:e.target.value})} />}
                      </div>
                    </div>
                    <div><label className="block text-sm font-black text-slate-400 mb-4 tracking-widest uppercase leading-none text-slate-400 font-sans">規則說明</label><input type="text" placeholder="說明" className="w-full p-4 bg-slate-100 rounded-xl border-none font-black text-lg h-16 text-slate-900 font-sans" value={newRule.desc} onChange={e=>setNewRule({...newRule, desc:e.target.value})} /></div>
                  </div>
                  <div className="space-y-6 text-slate-900 font-sans">
                      <label className="block text-sm font-black text-slate-400 tracking-widest uppercase flex items-center gap-2 text-slate-400 font-sans"><Clock size={16}/> 規則生效時段</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-slate-900">
                          <div className="space-y-4">
                              <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">生效星期</span>
                              <div className="flex flex-wrap gap-2 text-slate-900 font-sans">{DAYS.map((d, i) => { const isSel = newRule.days.includes(i); return (<button key={d} onClick={() => setNewRule({ ...newRule, days: isSel ? newRule.days.filter(x => x !== i) : [...newRule.days, i]})} className={`px-4 py-2 rounded-xl font-black border-2 transition-all ${isSel ? 'bg-blue-600 border-blue-700 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>{d}</button>);})}</div>
                          </div>
                          <div className="space-y-4">
                              <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">生效節次</span>
                              <div className="flex flex-wrap gap-2 text-slate-900 font-sans">{PERIODS.filter(p => !p.isRest).map((p) => { const isSel = newRule.periods.includes(p.id); return (<button key={p.id} onClick={() => setNewRule({ ...newRule, periods: isSel ? newRule.periods.filter(x => x !== p.id) : [...newRule.periods, p.id]})} className={`px-3 py-2 rounded-xl font-black border-2 transition-all text-sm ${isSel ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>{p.label.replace(/[^0-9]/g, '')}</button>);})}</div>
                          </div>
                      </div>
                  </div>
                  <div className="flex gap-4 font-sans font-black">
                    <button onClick={async () => { if(!newRule.desc || newRule.days.length===0 || newRule.periods.length === 0) return alert('資訊不全'); const targetVal = newRule.type==='grade'?newRule.target:(newRule.type==='classes'?newRule.classList:'全校'); let updated; if (editingRuleId) { updated = constraints.map(c => c.id === editingRuleId ? { ...newRule, id: editingRuleId, target: targetVal } : c); } else { updated = [...constraints, { ...newRule, id: Date.now(), target: targetVal }]; } setConstraints(updated); await setDoc(doc(db, "schools", currentSchool.id), { ...dbData, constraints: updated }); setNewRule({type: 'classes', target: '1', classList: '', days: [], periods: [], desc: ''}); setEditingRuleId(null); }} className={`flex-1 py-6 ${editingRuleId ? 'bg-orange-600' : 'bg-blue-900'} text-white rounded-[2rem] font-black text-2xl shadow-2xl transition-all leading-none font-serif text-white`}>
                      {editingRuleId ? '儲存修改' : '加入排課規則'}
                    </button>
                    {editingRuleId && <button onClick={() => { setEditingRuleId(null); setNewRule({type: 'classes', target: '1', classList: '', days: [], periods: [], desc: ''}); }} className="px-10 py-6 bg-slate-200 text-slate-600 rounded-[2rem] font-black text-2xl shadow-lg font-serif">取消編輯</button>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-4 lg:p-8 flex flex-col min-h-0 overflow-hidden bg-slate-50 text-slate-900 font-serif">
            {isLoading ? <div className="flex-1 flex items-center justify-center text-2xl font-black text-slate-300 animate-pulse font-sans">連線中...</div> : 
            <div className="flex-1 bg-white rounded-[2.5rem] shadow-2xl border-2 border-slate-300 overflow-hidden flex flex-col font-serif">
              <div className="grid grid-cols-6 bg-[#1e293b] text-white shrink-0 border-b-2 border-slate-600 leading-none font-sans">
                <div className="p-4 text-center text-[11px] font-black border-r border-slate-600 uppercase tracking-widest leading-relaxed">節次</div>
                {DAYS.map(day => <div key={day} className="p-4 text-center font-black text-xl border-r border-slate-600 last:border-r-0 leading-relaxed tracking-wider">{day}</div>)}
              </div>
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden text-slate-900">
                {PERIODS.map(period => (
                  <div key={period.id} className={`grid grid-cols-6 border-b-2 border-slate-300 last:border-b-0 flex-1 min-h-0 ${period.isRest ? 'bg-slate-100 flex-none h-14' : ''}`}>
                    <div className="flex flex-col items-center justify-center border-r-2 border-slate-300 bg-slate-50/80 shrink-0 font-sans text-slate-900">
                      <span className="font-black text-slate-800 text-xl leading-none">{period.label}</span>
                      <span className="text-[10px] text-slate-500 font-bold mt-1 tracking-tighter leading-none">{period.time}</span>
                    </div>
                    {period.isRest ? <div className="col-span-5 flex items-center justify-center text-slate-400 text-sm font-black tracking-[3em] uppercase bg-slate-100/50 italic leading-none font-sans">午 休 時 間</div> : 
                      DAYS.map((_, dIdx) => {
                        const items = getCellDataFn(dIdx, period.id);
                        const currentClassId = sidebarMode === 'class' ? selectedClass?.id : items[0]?.classId;
                        const lockRule = checkIsLocked(currentClassId, dIdx, period.id);
                        const swapIdx = swapQueue.findIndex(q => q.day === dIdx && q.period === period.id);
                        return (
                          <div key={dIdx} 
                            onClick={() => isManualSwapMode && handleManualSlotClick(dIdx, period.id, items[0])}
                            onDragOver={e => e.preventDefault()} onDrop={() => isEditMode && handleDrop(dIdx, period.id)} 
                            className={`border-r-2 border-slate-300 last:border-r-0 flex flex-col items-center justify-center text-center transition-all relative overflow-hidden ${lockRule ? 'bg-slate-50 cursor-not-allowed' : 'bg-white'} ${isEditMode && !lockRule ? 'hover:bg-blue-50/30' : ''} ${isManualSwapMode && !lockRule ? 'cursor-pointer hover:bg-green-50 ring-inset' : ''} ${swapIdx !== -1 ? 'ring-4 ring-green-500 z-10 bg-green-50/50' : ''}`}>
                            {swapIdx !== -1 && <div className="absolute top-2 left-2 w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center font-black text-xs shadow-lg animate-in zoom-in duration-200">{swapIdx + 1}</div>}
                            {lockRule && <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px'}}></div>}
                            {lockRule ? <div className="flex flex-col items-center gap-1 opacity-70 px-1 text-slate-500"><Lock size={22}/><span className="text-[14px] font-black uppercase tracking-tighter truncate max-w-full font-sans text-center">{lockRule.desc}</span></div> : 
                              items.map((item, idx) => (
                                <div key={idx} onDoubleClick={() => handleCellDoubleClick(item)} draggable={isEditMode} onDragStart={() => setDraggedItem(item)} className={`w-full px-1 flex flex-col items-center justify-center select-none ${isEditMode ? 'cursor-grab active:cursor-grabbing hover:scale-105 transition-transform' : ''}`}>
                                  {sidebarMode === 'teacher' ? (<><div className="font-black text-blue-900 text-3xl tracking-tighter mb-1 font-sans">{item.classId!=="未知"?item.classId:""}</div><div className="px-3 py-1 bg-blue-900 text-white text-[11px] font-black rounded-lg shadow-sm font-sans uppercase truncate max-w-full">{item.subject}</div></>) : (<div className="w-full flex flex-col items-center px-1"><div className="font-black text-slate-800 text-lg md:text-xl lg:text-2xl tracking-tighter leading-tight mb-1 truncate max-w-full font-sans text-center">{item.subject}</div><div className="px-2 py-0.5 bg-slate-800 text-white text-[10px] font-black rounded-md shadow-sm opacity-90 font-sans truncate max-w-[90%] text-center">{item.teacherName}</div></div>)}
                                </div>
                              ))}
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

      {proposals.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[60] p-4 font-sans overflow-hidden text-slate-900">
          <div className="bg-[#f8fafc] rounded-[3.5rem] shadow-2xl border-4 border-blue-900 w-full max-w-6xl h-[95vh] flex flex-col overflow-hidden animate-in zoom-in duration-300">
            <div className="py-3 px-6 bg-white border-b-2 border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-50 text-blue-900 rounded-xl flex items-center justify-center shadow-inner font-black"><GitBranch size={22}/></div><div><h3 className="text-xl font-black text-slate-800">{isAdmin ? '智慧調課預覽分析' : '模擬調課結果預覽'}</h3><p className="text-slate-400 font-bold text-xs">分析已完成</p></div></div>
              <button onClick={() => { setProposals([]); setPreviewProposal(null); }} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all font-black"><X size={24}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50 flex flex-col">
              {previewProposal ? (
                <div className="animate-in slide-in-from-right-4 duration-500 flex flex-col h-full">
                    <div ref={exportRef} className="p-4 bg-slate-50 flex flex-col gap-4">
                        <div className="bg-white p-3 rounded-2xl border-2 border-blue-600 shadow-lg shrink-0">
                            <div className="flex items-center gap-3 mb-2"><span className="text-blue-600 font-black text-xs uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-100 font-sans">預覽方案：{previewProposal.title}</span><span className="text-orange-500 font-black text-2xl font-serif">{previewProposal.letter} 方案</span></div>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-2">{previewProposal.actions.map((act, idx) => { const warning = getSlotWarning(act.t, act.d, act.p); return (<div key={idx} className="flex items-center gap-2 text-slate-800 font-black text-base font-serif"><span>{idx + 1}. [{act.t}] → {DAYS[act.d]} {PERIODS.find(p => p.id === act.p)?.label}</span>{warning && <span className="ml-2 px-1.5 py-0.5 border border-red-500 text-red-600 text-[10px] font-black rounded bg-red-50/50 whitespace-nowrap">{warning}</span>}</div>)})}</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-0 text-slate-900">{Array.from(new Set(previewProposal.actions.map(a => a.t))).map(tName => (<PreviewGrid key={tName} teacherName={tName} moves={previewProposal.actions} />))}</div>
                    </div>
                    <div className="flex flex-wrap justify-center items-center gap-3 py-4 mt-auto shrink-0 border-t border-slate-200 bg-white/50 rounded-b-[2.5rem]">
                        <button onClick={() => setPreviewProposal(null)} className="flex items-center gap-2 px-5 py-3 bg-slate-200 text-slate-600 rounded-xl font-black text-lg hover:bg-slate-300 transition-all font-sans"><ArrowRight size={20} className="rotate-180" /> 返回列表</button>
                        <button onClick={handleSaveAsImage} className="flex items-center gap-2 px-5 py-3 bg-white text-blue-600 border-2 border-blue-200 rounded-xl font-black text-lg hover:bg-blue-50 transition-all shadow-sm font-sans"><Camera size={20} /> 另存圖片</button>
                        {isAdmin ? (<button onClick={executeFinalAdopt} className="flex items-center gap-3 px-10 py-3.5 bg-blue-900 text-white rounded-xl font-black text-xl shadow-lg hover:bg-blue-800 hover:-translate-y-1 transition-all border-b-4 border-blue-950 font-sans">採用此方案 <CheckCircle2 size={24}/></button>) : (<div className="flex flex-col items-center px-6">{dbData.isApplyEnabled ? (<><span className="text-purple-700 font-black text-sm mb-1 uppercase tracking-widest animate-pulse font-serif">模擬完成！如需正式調動：</span><Link to="/apply" className="bg-purple-600 text-white px-8 py-3 rounded-xl font-black hover:bg-purple-700 shadow-lg transition-all flex items-center gap-2 font-serif font-black">前往填寫「自主調課表」 <ArrowRight size={20}/></Link></>) : (<div className="flex items-center gap-2 px-8 py-3 bg-slate-100 text-slate-400 rounded-xl font-black border-2 border-slate-200 font-serif"><Lock size={18} /> 目前非自主調課時段</div>)}</div>)}
                        <button onClick={() => { setProposals([]); setPreviewProposal(null); }} className="flex items-center gap-2 px-5 py-3 bg-red-50 text-red-500 border border-red-100 rounded-xl font-black text-lg hover:bg-red-500 hover:text-white transition-all font-sans font-black"><Trash2 size={20} /> 放棄調動</button>
                    </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-900">
                  {proposals.map((p, i) => (
                    <div key={i} className={`p-6 rounded-3xl border-2 bg-white flex flex-col justify-between transition-all shadow-lg group hover:border-blue-900 hover:shadow-2xl text-slate-900`}>
                      <div className="flex items-start gap-4 mb-4 text-slate-900"><div className="mt-1 text-slate-900">{p.type === 'MOVE' ? <CheckCircle2 className="text-green-600" size={32} /> : p.type === 'SWAP' ? <ArrowRightLeft className="text-indigo-600" size={32} /> : p.type === 'TRIANGLE' ? <RefreshCw className="text-purple-600 animate-spin-slow" size={32} /> : <XCircle className="text-red-600" size={32} />}</div>
                        <div className="flex-1 text-slate-900"><div className="flex justify-between items-center mb-2 font-serif font-black"><span className="font-black text-xl text-slate-800">{String.fromCharCode(65 + i)} 方案：{p.title}</span><span className={`text-[10px] font-black px-2 py-0.5 rounded-full text-white font-sans ${p.color==='blue'?'bg-blue-600':p.color==='indigo'?'bg-indigo-600':p.color==='purple'?'bg-purple-600':'bg-red-600'}`}>{p.impact}</span></div>
                          <div className="space-y-1.5 mt-2 text-slate-900">{p.actions?.map((act, idx) => { const warning = getSlotWarning(act.t, act.d, act.p); return (<div key={idx} className="flex items-center gap-2 flex-wrap text-slate-600 font-bold text-lg font-serif font-black"><span>{idx + 1}. [{act.t}] → {DAYS[act.d]} {PERIODS.find(per => per.id === act.p)?.label}</span>{warning && <span className="px-1.5 py-0.5 border border-red-500 text-red-600 text-[10px] font-black rounded bg-red-50/30 whitespace-nowrap font-sans">{warning}</span>}</div>);})}</div>
                        </div>
                      </div>
                      {!p.disabled && <button onClick={() => setPreviewProposal({ ...p, letter: String.fromCharCode(65 + i) })} className="mt-3 w-full bg-slate-800 text-white py-4 rounded-xl font-black text-xl hover:bg-black transition-all flex items-center justify-center gap-2 font-serif font-black text-white">預覽方案結果 <ArrowRight size={24}/></button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .animate-spin-slow { animation: spin 8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
}