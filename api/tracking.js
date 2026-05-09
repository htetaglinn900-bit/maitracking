export default async function handler(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: "ID is required" });
    }

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DATABASE_ID = process.env.NOTION_DATABASE_ID;

    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filter: {
                    property: 'ပါဆယ် နံပါတ်',
                    rich_text: {
                        equals: id
                    }
                }
            })
        });

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            return res.status(404).json({ error: "ID Not Found" });
        }

        const page = data.results[0].properties;

        // Notion Property တန်ဖိုးများကို ထုတ်ယူရန် Helper Function
        const getValue = (prop) => {
            if (!prop) return "";
            
            if (prop.type === 'formula') {
                const formulaVal = prop.formula;
                // Formula ရလဒ်သည် Number သို့မဟုတ် String ဖြစ်နိုင်သည်
                if (formulaVal.type === 'number') return formulaVal.number?.toString() || "0";
                if (formulaVal.type === 'string') return formulaVal.string || "";
                return "0";
            }
            
            switch (prop.type) {
                case 'title': return prop.title[0]?.plain_text || "";
                case 'rich_text': return prop.rich_text[0]?.plain_text || "";
                case 'select': return prop.select?.name || "";
                case 'status': return prop.status?.name || "";
                case 'number': return prop.number?.toString() || "0";
                case 'date': return prop.date?.start || "";
                default: return "";
            }
        };

        // --- ဈေးနှုန်းတွက်ချက်မှု Logic အသစ် ---
        // ၁။ Final Formula ကို အရင်ယူကြည့်မည်
        let finalCost = getValue(page['Total Cost (Baht) - Final']);
        
        // ၂။ အကယ်၍ Final ထဲမှာ ဘာမှမရှိခဲ့ရင် (သို့မဟုတ် "0" ဖြစ်နေရင်) အဟောင်းကို သုံးမည်
        if (!finalCost || finalCost === "0") {
            finalCost = getValue(page['Total Cost (Baht)']);
        }

        const result = {
            'Name': getValue(page['Name']),
            // Notion ထဲက နာမည်အတိအကျကို အောက်မှာ ပြန်စစ်ပေးပါ
            'Current status': getValue(page['Current Status']) || getValue(page['Current status']) || "-", 
            'Route': getValue(page['Route']),
            'Weight (kg)': getValue(page['Weight (kg)']),
            'Total Cost (Baht)': finalCost,
            'ETA': getValue(page['ETA']),
        };

        return res.status(200).json(result);

    } catch (error) {
        console.error("Notion Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
