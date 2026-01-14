import pdfplumber
import json
import os
import re
from collections import Counter

PDF_FOLDER = './parser/pdfs'
OUTPUT_FILE = './src/data.json'

# --- 鳳中學科分類對照表 (僅用於左側側邊欄分組) ---
# 這裡只要包含關鍵字，就會被歸類到該大類
CAT_MAP = {
    '國文': '國文', '文選': '國文', '各類': '國文', '閱讀': '國文', 
    '英文': '英文', '英語': '英文',
    '數學': '數學', '數乙': '數學', '數甲': '數學',
    '物理': '物理', '化學': '化學', '生物': '生物', '地科': '地球科學', '地球': '地球科學',
    '歷史': '歷史', '地理': '地理', '公民': '公民',
    '體育': '體育', '音樂': '音樂', '美術': '美術', '藝術': '藝術與生活',
    '健康': '健康與護理', '護理': '健康與護理', '全民': '全民國防', '國防': '全民國防',
    '本土': '本土語', '語': '本土語', '生命': '生命教育', '生活': '生活科技', 
    '資訊': '資訊', '科技': '生活科技', '微課程': '微課程', '多元選修': '多元選修'
}

def get_category(sub_name):
    for key, value in CAT_MAP.items():
        if key in sub_name: return value
    return "其他"

def parse_schedules():
    all_data = {"teachers": [], "classes": [], "schedules": []}
    teacher_raw_info = {}

    pdf_files = [f for f in os.listdir(PDF_FOLDER) if f.endswith(".pdf")]
    print(f"正在執行鳳中課表深度解析...")

    for filename in pdf_files:
        path = os.path.join(PDF_FOLDER, filename)
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                
                # 1. 抓取姓名、職稱、兼課狀態
                # 匹配：教師：王小明(兼) 物理組(導師)
                t_match = re.search(r"教師：\s*([^\s(]+)(\(兼\))?\s*([^\s]*)", text)
                if not t_match: continue
                
                t_name = t_match.group(1).strip()
                is_adjunct = t_match.group(2) is not None
                raw_info = t_match.group(3).strip()
                
                # 提取行政職稱 (主任、組長、組、秘書)
                admin_role = ""
                role_match = re.search(r"([^\s(]*?(組長|主任|秘書|組))", raw_info)
                if role_match:
                    admin_role = role_match.group(1)

                if t_name not in teacher_raw_info:
                    teacher_raw_info[t_name] = {
                        "name": t_name,
                        "adminRole": admin_role,
                        "isAdjunct": is_adjunct,
                        "isHomeroom": "導師" in raw_info or "導師" in text,
                        "detected_subs": []
                    }

                table = page.extract_table()
                if not table: continue
                p_map = {"一":1, "二":2, "三":3, "四":4, "五":6, "六":7, "七":8, "八":9}

                for row in table:
                    if not row or len(row) < 6: continue
                    p_id = None
                    for k, v in p_map.items():
                        if k in str(row[0])+str(row[1]): p_id = v; break
                    
                    if p_id:
                        for d_idx, cell in enumerate(row[-5:]):
                            if cell and len(cell.strip()) > 0:
                                lines = [l.strip() for l in cell.split('\n') if l.strip()]
                                
                                # 保留原始科目名稱 (如：數學乙、微課程)
                                subject_original = lines[0] if len(lines) > 0 else "未知"
                                
                                # 特殊轉換：如果是單個字的「語」或「活」，才轉換
                                if subject_original == "語": subject_original = "本土語"
                                if subject_original == "活": subject_original = "團體活動"

                                # 找班級代號
                                class_id = "未知"
                                for line in lines:
                                    c_match = re.search(r"(\d{3})", line)
                                    if c_match: class_id = c_match.group(1); break
                                
                                # 用於分類的學科判定
                                if subject_original not in ['學習', '自習', '班會', '週會', '團體活動']:
                                    teacher_raw_info[t_name]["detected_subs"].append(get_category(subject_original))

                                all_data["schedules"].append({
                                    "id": f"S{len(all_data['schedules'])}",
                                    "teacherName": t_name,
                                    "classId": class_id,
                                    "subject": subject_original, # 課表上直接顯示這個
                                    "day": d_idx,
                                    "period": p_id
                                })

    # 2. 產出老師資料
    for name, info in teacher_raw_info.items():
        if info["detected_subs"]:
            major_cat = Counter(info["detected_subs"]).most_common(1)[0][0]
        else:
            major_cat = "國文"

        all_data["teachers"].append({
            "id": f"T{len(all_data['teachers'])+1:03d}",
            "name": name,
            "subject": major_cat, 
            "adminRole": info["adminRole"],
            "isAdjunct": info["isAdjunct"],
            "isHomeroom": info["isHomeroom"]
        })

    # 班級處理
    class_ids = sorted(list(set([s["classId"] for s in all_data["schedules"] if s["classId"] != "未知"])))
    for c in class_ids:
        all_data["classes"].append({"id": c, "name": f"{c}班", "grade": f"高{c[0]}" if c[0].isdigit() else "其他"})

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    print(f"解析完成！資料已更新至 {OUTPUT_FILE}")

if __name__ == "__main__":
    parse_schedules()