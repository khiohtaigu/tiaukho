import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom'; 
import { db } from './firebase';
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { 
  Send, AlertCircle, CheckCircle2, UserCheck, Calendar, 
  Plus, Trash2, ArrowRight, Layers, BookOpen, ChevronRight,
  Monitor 
} from 'lucide-react';

const DAYS = ['週一', '週二', '週三', '週四', '週五'];
const PERIODS = [
  { id: 1, label: '第1節' }, { id: 2, label: '第2節' }, { id: 3, label: '第3節' },
  { id: 4, label: '第4節' }, { id: 6, label: '第5節' }, { id: 7, label: '第6節' },
  { id: 8, label: '第7節' }, { id: 9, label: '第8節' }
];

const SIDEBAR_ORDER = ['國文', '英文', '數學', '自然科', '社會科', '藝能科', '本土語'];
// 將「本土語」加入核心科目清單，觸發自動套用邏輯
const CORE_SUBJECTS = ['國文', '英文', '數學', '本土語'];

export default function TeacherForm() {
  const schoolId = "fssh";
  const [dbData, setDbData] = useState(null);
  
  const [fillerDomain, setFillerDomain] = useState("");
  const [fillerSubject, setFillerSubject] = useState("");
  const [fillerName, setFillerName] = useState("");

  const [adjustments, setAdjustments] = useState([
    { id: Date.now(), domain: "", subject: "", teacherName: "", lessonId: "", toDay: "", toPeriod: "" }
  ]);
  
  const [status, setStatus] = useState({ type: '', msg: '' });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "schools", schoolId), (snap) => {
      if (snap.exists()) setDbData(snap.data());
    });
    return () => unsub();
  }, []);

  const domainData = useMemo(() => {
    if (!dbData) return {};
    const data = {};
    SIDEBAR_ORDER.forEach(d => data[d] = {});

    dbData.teachers.forEach(t => {
      let d = t.domain || "其他";
      let s = t.subject || "其他";
      
      // 邏輯優化：如果是核心科目或本土語，統一對齊選單名稱
      if (CORE_SUBJECTS.includes(d)) {
          s = d; 
      } else if (s === '本土語' || t.teachesNative) {
          d = '本土語';
          s = '本土語';
      }

      if (!data[d]) data[d] = {};
      if (!data[d][s]) data[d][s] = [];
      data[d][s].push(t);
    });
    return data;
  }, [dbData]);

  const addAdjustment = () => {
    setAdjustments([...adjustments, { id: Date.now(), domain: "", subject: "", teacherName: "", lessonId: "", toDay: "", toPeriod: "" }]);
  };

  const removeAdjustment = (id) => {
    if (adjustments.length > 1) setAdjustments(adjustments.filter(a => a.id !== id));
  };

  const updateAdj = (id, field, value) => {
    setAdjustments(adjustments.map(a => {
      if (a.id === id) {
        const updated = { ...a, [field]: value };
        if (field === 'domain') {
          // 自動套用：國、英、數、本土語
          updated.subject = CORE_SUBJECTS.includes(value) ? value : "";
          updated.teacherName = ""; updated.lessonId = "";
        }
        if (field === 'subject') { updated.teacherName = ""; updated.lessonId = ""; }
        if (field === 'teacherName') { updated.lessonId = ""; }
        return updated;
      }
      return a;
    }));
  };

  const validateLoop = () => {
    if (adjustments.some(a => !a.teacherName || !a.lessonId || a.toDay === "" || a.toPeriod === "")) {
      return "請填寫完整的調動資訊。";
    }
    const affectedTeachers = new Set(adjustments.map(a => a.teacherName));
    const affectedClasses = new Set(
      adjustments.map(adj => dbData.schedules.find(s => s.id === adj.lessonId)?.classId)
                 .filter(c => c && c !== "未知" && c !== "nan" && c !== "")
    );
    let tempSchedules = JSON.parse(JSON.stringify(dbData.schedules));
    adjustments.forEach(adj => {
      const idx = tempSchedules.findIndex(s => s.id === adj.lessonId);
      if (idx !== -1) {
        tempSchedules[idx].day = parseInt(adj.toDay);
        tempSchedules[idx].period = parseInt(adj.toPeriod);
      }
    });
    const teacherOccupancy = {}; 
    const classOccupancy = {};
    for (let s of tempSchedules) {
      if (affectedTeachers.has(s.teacherName)) {
        const tKey = `${s.teacherName}-${s.day}-${s.period}`;
        if (teacherOccupancy[tKey]) return `衝突：${s.teacherName} 老師在 ${DAYS[s.day]} ${PERIODS.find(p=>p.id===s.period)?.label} 衝堂。`;
        teacherOccupancy[tKey] = true;
      }
      if (affectedClasses.has(s.classId)) {
        const cKey = `${s.classId}-${s.day}-${s.period}`;
        if (classOccupancy[cKey]) return `衝突：${s.classId} 班級在 ${DAYS[s.day]} ${PERIODS.find(p=>p.id===s.period)?.label} 衝堂。`;
        classOccupancy[cKey] = true;
      }
    }
    for (let adj of adjustments) {
      const lesson = dbData.schedules.find(s => s.id === adj.lessonId);
      const d = parseInt(adj.toDay);
      const p = parseInt(adj.toPeriod);
      const lockRule = dbData.constraints?.find(rule => {
        if (!rule.days.includes(d) || !rule.periods.includes(p)) return false;
        if (rule.type === 'all') return true;
        if (rule.type === 'grade' && lesson.classId.startsWith(rule.target)) return true;
        if (rule.type === 'classes' && rule.target.includes(lesson.classId)) return true;
        return false;
      });
      if (lockRule) return `違規：${lesson.classId} 在該時段為「${lockRule.desc}」禁區。`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const error = validateLoop();
    if (error) { setStatus({ type: 'error', msg: error }); return; }
    try {
      const nextSchedules = [...dbData.schedules];
      adjustments.forEach(adj => {
        const idx = nextSchedules.findIndex(s => s.id === adj.lessonId);
        if (idx !== -1) nextSchedules[idx] = { ...nextSchedules[idx], day: parseInt(adj.toDay), period: parseInt(adj.toPeriod) };
      });
      await updateDoc(doc(db, "schools", schoolId), { schedules: nextSchedules });
      setStatus({ type: 'success', msg: '調動已成功同步！' });
      setAdjustments([{ id: Date.now(), domain: "", subject: "", teacherName: "", lessonId: "", toDay: "", toPeriod: "" }]);
    } catch (e) { setStatus({ type: 'error', msg: '更新失敗。' }); }
  };

  if (!dbData) return <div className="p-10 text-center font-black animate-pulse">連線中...</div>;

  return (
    <div className="min-h-screen bg-[#f1f5f9] p-4 lg:p-10 font-serif text-slate-900">
      <div className="max-w-6xl mx-auto bg-white rounded-[2.5rem] shadow-2xl border-4 border-[#1e40af] overflow-hidden">
        
        <div className="bg-[#1e40af] p-10 text-white relative">
          <Link to="/" className="absolute top-10 right-10 flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-5 py-3 rounded-2xl font-black transition-all border border-white/30 shadow-lg backdrop-blur-sm">
            <Monitor size={20} /> 檢視全校課表
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md"><Calendar size={40} /></div>
            <div>
              <h1 className="text-4xl font-black tracking-tight">教師自主調課表</h1>
              <p className="text-blue-100 font-bold opacity-80 mt-1">請依照對調結果正確填寫路徑</p>
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-12 space-y-12">
          {/* Section 1: 填表人資訊 */}
          <section className="space-y-6">
            <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><UserCheck size={20}/> 1. 填表人資訊</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <select className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-black text-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                value={fillerDomain} onChange={e => { 
                  const val = e.target.value;
                  setFillerDomain(val); 
                  setFillerSubject(CORE_SUBJECTS.includes(val) ? val : ""); 
                  setFillerName(""); 
                }}>
                <option value="">選擇領域</option>
                {SIDEBAR_ORDER.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-black text-lg disabled:opacity-50"
                disabled={!fillerDomain} value={fillerSubject} onChange={e => { setFillerSubject(e.target.value); setFillerName(""); }}>
                <option value="">選擇科目</option>
                {fillerDomain && Object.keys(domainData[fillerDomain] || {}).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-black text-lg disabled:opacity-50"
                disabled={!fillerSubject} value={fillerName} onChange={e => setFillerName(e.target.value)}>
                <option value="">選擇姓名</option>
                {(domainData[fillerDomain]?.[fillerSubject] || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          </section>

          {/* Section 2: 調動路徑設定 */}
          {fillerName && (
            <section className="space-y-6 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Layers size={20}/> 2. 調動路徑設定</h3>
                <button onClick={addAdjustment} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all active:scale-95"><Plus size={20}/> 增加其他調動</button>
              </div>
              <div className="space-y-6">
                {adjustments.map((adj, index) => (
                  <div key={adj.id} className="relative p-8 bg-slate-50 rounded-[2.5rem] border-2 border-slate-200 shadow-sm flex flex-col gap-6 group">
                    <div className="flex items-center gap-4 flex-wrap lg:flex-nowrap">
                      <div className="w-10 h-10 rounded-full bg-[#1e40af] text-white flex items-center justify-center font-black shrink-0 shadow-lg">{index + 1}</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
                        <select className="p-3 bg-white rounded-xl border border-slate-200 font-bold" value={adj.domain} onChange={e => updateAdj(adj.id, 'domain', e.target.value)}>
                          <option value="">領域</option>
                          {SIDEBAR_ORDER.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <select className="p-3 bg-white rounded-xl border border-slate-200 font-bold disabled:bg-slate-100" disabled={!adj.domain} value={adj.subject} onChange={e => updateAdj(adj.id, 'subject', e.target.value)}>
                          <option value="">科目</option>
                          {adj.domain && Object.keys(domainData[adj.domain] || {}).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select className="p-3 bg-white rounded-xl border border-slate-200 font-bold disabled:bg-slate-100" disabled={!adj.subject} value={adj.teacherName} onChange={e => updateAdj(adj.id, 'teacherName', e.target.value)}>
                          <option value="">選擇老師</option>
                          {(domainData[adj.domain]?.[adj.subject] || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
                      </div>
                      {adjustments.length > 1 && <button onClick={() => removeAdjustment(adj.id)} className="p-3 text-slate-300 hover:text-red-500"><Trash2 size={24}/></button>}
                    </div>
                    <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 flex-wrap">
                        <div className="flex-1 min-w-[250px] flex items-center gap-3">
                            <BookOpen size={18} className="text-blue-600 shrink-0" />
                            <select className="w-full p-2 border-none font-black text-lg disabled:opacity-30" disabled={!adj.teacherName} value={adj.lessonId} onChange={e => updateAdj(adj.id, 'lessonId', e.target.value)}>
                              <option value="">選擇欲調動之原課程時段</option>
                              {dbData.schedules.filter(s => s.teacherName === adj.teacherName).sort((a, b) => (a.day !== b.day) ? (a.day - b.day) : (a.period - b.period)).map(l => (
                                  <option key={l.id} value={l.id}>{DAYS[l.day]} {PERIODS.find(p=>p.id===l.period)?.label} - {l.classId} ({l.subject})</option>
                              ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
                          <span className="text-xs font-black text-blue-400 uppercase mr-2">移至</span>
                          <select className="bg-transparent border-none font-black text-blue-700 text-lg" value={adj.toDay} onChange={e => updateAdj(adj.id, 'toDay', e.target.value)}>
                            <option value="">星期</option>
                            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                          </select>
                          <select className="bg-transparent border-none font-black text-blue-700 text-lg" value={adj.toPeriod} onChange={e => updateAdj(adj.id, 'toPeriod', e.target.value)}>
                            <option value="">節次</option>
                            {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="space-y-6 pt-6 text-slate-900 font-serif">
            {status.msg && <div className={`p-6 rounded-[2rem] flex items-center gap-4 font-black text-xl animate-in zoom-in ${status.type === 'success' ? 'bg-green-50 text-green-700 border-2 border-green-200' : 'bg-red-50 text-red-700 border-2 border-red-200'}`}><AlertCircle size={36}/> {status.msg}</div>}
            <button onClick={handleSubmit} disabled={!fillerName} className={`w-full py-7 rounded-[2.5rem] font-black text-2xl flex items-center justify-center gap-3 shadow-2xl ${!fillerName ? 'bg-slate-200 text-slate-400' : 'bg-[#1e40af] text-white hover:bg-blue-800 active:scale-95'}`}><Send size={32} /> 提交調動並更新課表</button>
          </div>
        </div>
      </div>
    </div>
  );
}