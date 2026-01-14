import json
import pandas as pd
import os

# 設定路徑
INPUT_JSON = './src/data.json'
OUTPUT_EXCEL = './課表資料核對表.xlsx'

def convert_to_excel():
    if not os.path.exists(INPUT_JSON):
        print(f"錯誤：找不到 {INPUT_JSON}，請先執行 extract.py")
        return

    with open(INPUT_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 1. 建立老師資訊對照
    teacher_map = {t['name']: t for t in data['teachers']}

    # 2. 準備整理後的總資料清單
    rows = []
    days_name = ['週一', '週二', '週三', '週四', '週五']
    # 鳳中節次：1-4 為 1-4 節, 6-9 為 5-8 節
    periods_name = {1:'1', 2:'2', 3:'3', 4:'4', 6:'5', 7:'6', 8:'7', 9:'8'}

    for s in data['schedules']:
        t_info = teacher_map.get(s['teacherName'], {})
        rows.append({
            '學科': t_info.get('subject', '其他'),
            '老師姓名': s['teacherName'],
            '兼課/代理': '代理/兼課' if t_info.get('isAdjunct') else '正式',
            '行政職稱': t_info.get('adminRole', ''),
            '是否導師': '是' if t_info.get('isHomeroom') else '',
            '課表原始名稱': s['subject'],
            '班級': s['classId'],
            '星期': days_name[s['day']],
            '節次': periods_name.get(s['period'], s['period'])
        })

    # 3. 轉為總 DataFrame
    df_all = pd.DataFrame(rows)
    
    # 4. 使用 ExcelWriter 來儲存多個分頁
    with pd.ExcelWriter(OUTPUT_EXCEL, engine='openpyxl') as writer:
        # 取得所有學科清單並排序
        subjects = sorted(df_all['學科'].unique())
        
        for sub in subjects:
            # 過濾出該學科的老師
            df_sub = df_all[df_all['學科'] == sub].copy()
            
            # 排序：按老師姓名 -> 星期 -> 節次
            # 為了讓星期排序正確，我們暫時把週一~週五轉回數字排完再轉回來
            day_map = {'週一':1, '週二':2, '週三':3, '週四':4, '週五':5}
            df_sub['day_num'] = df_sub['星期'].map(day_map)
            df_sub['period_num'] = pd.to_numeric(df_sub['節次'])
            
            df_sub = df_sub.sort_values(by=['老師姓名', 'day_num', 'period_num'])
            
            # 移除輔助排序用的欄位，並寫入 Excel 分頁
            df_sub = df_sub.drop(columns=['day_num', 'period_num'])
            
            # 工作表名稱不能太長或包含特殊字元，進行簡單處理
            sheet_name = sub.replace('/', '').replace('*', '')[:30]
            df_sub.to_excel(writer, sheet_name=sheet_name, index=False)

    print(f"成功！Excel 已產生，包含 {len(subjects)} 個學科分頁。")
    print(f"檔案位置：{os.path.abspath(OUTPUT_EXCEL)}")

if __name__ == "__main__":
    convert_to_excel()