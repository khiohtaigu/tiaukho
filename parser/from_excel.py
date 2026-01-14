import pandas as pd
import json
import os

INPUT_EXCEL = './課表資料核對表.xlsx'
OUTPUT_JSON = './src/data.json'

def import_from_excel():
    if not os.path.exists(INPUT_EXCEL):
        print(f"錯誤：找不到 {INPUT_EXCEL}")
        return

    excel_file = pd.ExcelFile(INPUT_EXCEL)
    all_sheets_df = []
    
    # 建立一個紀錄老師是否出現在本土語分頁的清單
    native_teachers = set()

    for sheet_name in excel_file.sheet_names:
        if sheet_name == "禁區設定": continue
        
        df = excel_file.parse(sheet_name)
        all_sheets_df.append(df)
        
        # 如果分頁名稱是本土語，記錄下這些老師的名字
        if "本土語" in sheet_name:
            names = df['老師姓名'].dropna().unique()
            for n in names: native_teachers.add(str(n).strip())
    
    df_all = pd.concat(all_sheets_df, ignore_index=True)

    data = {"teachers": [], "classes": [], "schedules": [], "constraints": []}
    
    # 讀取禁區設定分頁
    if "禁區設定" in excel_file.sheet_names:
        df_cons = excel_file.parse("禁區設定")
        day_map = {'週一': 0, '週二': 1, '週三': 2, '週四': 3, '週五': 4}
        period_label_map = {'第1節': 1, '第2節': 2, '第3節': 3, '第4節': 4, '第5節': 6, '第6節': 7, '第7節': 8, '第8節': 9}
        for _, row in df_cons.iterrows():
            type_raw = str(row['類型'] || '')
            if not type_raw: continue
            rule_type = 'classes'; target = type_raw
            if "全校" in type_raw: rule_type = 'all'
            elif "高一全" in type_raw: rule_type = 'grade'; target = '1'
            elif "高二全" in type_raw: rule_type = 'grade'; target = '2'
            elif "高三全" in type_raw: rule_type = 'grade'; target = '3'
            data["constraints"].append({
                "id": f"C{len(data['constraints'])}",
                "type": rule_type, "target": str(target),
                "days": [day_map.get(row['星期'], 0)],
                "periods": [period_label_map.get(row['節次'], 1)],
                "desc": str(row['說明'])
            })

    teacher_cache = {}
    class_set = set()
    schedule_check = set()

    day_map_val = {'週一': 0, '週二': 1, '週三': 2, '週四': 3, '週五': 4}
    period_map_val = {1:1, 2:2, 3:3, 4:4, 5:6, 6:7, 7:8, 8:9}

    for _, row in df_all.iterrows():
        if pd.isna(row['老師姓名']): continue
        t_name = str(row['老師姓名']).strip()
        
        if t_name not in teacher_cache:
            admin_role = str(row['行政職稱']) if pd.notna(row['行政職稱']) and str(row['行政職稱']) != 'nan' else ''
            teacher_cache[t_name] = {
                "id": f"T{len(teacher_cache)+1:03d}",
                "name": t_name,
                "order": row.get('編號', 999),
                "domain": str(row.get('領域', '')),
                "subject": str(row['學科']),
                "adminRole": admin_role,
                "isAdjunct": "兼課" in admin_role,
                "isHomeroom": row['是否導師'] == '是',
                "teachesNative": t_name in native_teachers # 標記是否教本土語
            }
            data["teachers"].append(teacher_cache[t_name])

        d = day_map_val.get(row['星期'], 0)
        p = period_map_val.get(int(row['節次']), 1)
        check_key = f"{t_name}-{d}-{p}"
        if check_key not in schedule_check:
            c_id = str(row['班級']).strip()
            if c_id != '未知' and c_id != 'nan': classSet.add(c_id)
            data["schedules"].append({
                "id": f"S{len(data['schedules'])}",
                "teacherName": t_name,
                "classId": c_id,
                "subject": str(row['課表原始名稱']),
                "day": d, "period": p
            })
            schedule_check.add(check_key)

    for c in sorted(list(class_set)):
        data["classes"].append({"id": c, "name": f"{c}班", "grade": f"高{c[0]}"})

    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"匯入成功！本土語教師共計 {len(native_teachers)} 位。")

if __name__ == "__main__":
    import_from_excel()