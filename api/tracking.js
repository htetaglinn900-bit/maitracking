export default async function handler(req, res) {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "ID is required" });

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const TRACKING_DB_ID = process.env.NOTION_DATABASE_ID;
    const CUSTOMER_DB_ID = process.env.NOTION_CUSTOMER_DATABASE_ID;

    try {
        // 1. Fetch Order Page from Tracking Database
        const trackingRes = await fetch(`https://api.notion.com/v1/databases/${TRACKING_DB_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filter: { property: 'ပါဆယ် နံပါတ်', rich_text: { equals: id } }
            })
        });

        const trackingData = await trackingRes.json();
        if (!trackingData.results || trackingData.results.length === 0) {
            return res.status(404).json({ error: "ID Not Found" });
        }

        const pageProps = trackingData.results[0].properties;

        // Robust Universal Value Extractor
        const parseProp = (prop) => {
            if (!prop) return "0";
            if (prop.type === 'formula') {
                const f = prop.formula;
                if (!f) return "0";
                if (f.type === 'number') return f.number !== null && f.number !== undefined ? f.number.toString() : "0";
                if (f.type === 'string') return f.string || "0";
                return "0";
            }
            if (prop.type === 'rollup') {
                const r = prop.rollup;
                if (!r) return "0";
                if (r.type === 'number') return r.number !== null && r.number !== undefined ? r.number.toString() : "0";
                if (r.type === 'array' && r.array && r.array.length > 0) {
                    const item = r.array[0];
                    if (item.type === 'number') return item.number?.toString() || "0";
                    if (item.type === 'formula' && item.formula?.type === 'number') return item.formula.number?.toString() || "0";
                }
                return "0";
            }
            switch (prop.type) {
                case 'title': return prop.title[0]?.plain_text || "";
                case 'rich_text': return prop.rich_text[0]?.plain_text || "";
                case 'select': return prop.select?.name || "";
                case 'status': return prop.status?.name || "";
                case 'number': return prop.number !== null && prop.number !== undefined ? prop.number.toString() : "0";
                case 'date': return prop.date?.start || "";
                default: return "";
            }
        };

        // Flexible Column Finder to bypass exact name mismatches
        const getPropValByKeyword = (props, keyword) => {
            const matchedKey = Object.keys(props).find(k => k.trim().toLowerCase().includes(keyword.toLowerCase()));
            return matchedKey ? parseProp(props[matchedKey]) : "0";
        };

        const customerName = parseProp(pageProps['Name']);
        const weightVal = parseProp(pageProps['Weight (kg)']);

        // Price Fallback Priority
        let finalCost = parseProp(pageProps['Total Cost (Baht) - Final']);
        if (!finalCost || finalCost === "0") finalCost = parseProp(pageProps['Total Cost (Baht)']);
        if (!finalCost || finalCost === "0") finalCost = parseProp(pageProps['Total Cost (Baht) - Locked']);

        // 1. Earned Points from Tracking DB
        let mPointEarned = getPropValByKeyword(pageProps, 'M Point Earn');
        if (!mPointEarned || mPointEarned === "0") {
            // Fallback calculation if Notion Formula returns 0
            const costNum = parseFloat(finalCost || "0");
            const wNum = parseFloat(weightVal || "0");
            if (costNum > 0 && (wNum >= 50 || pageProps['MAI CARGO - B2B Customer Profiles']?.relation?.length > 0)) {
                mPointEarned = Math.floor(costNum / 100).toString();
            }
        }

        let pointsUsed = getPropValByKeyword(pageProps, 'Points Used');

        // 2. Extract Customer Relation Link
        const relationProp = Object.keys(pageProps).find(k => k.toLowerCase().includes('b2b customer profiles'));
        const relationObj = relationProp ? pageProps[relationProp] : null;
        const hasB2BRelation = relationObj && relationObj.relation && relationObj.relation.length > 0;

        let customerTotalBalance = "0";

        // Fetch Customer Profiles Database directly using B2B Customer Page ID
        if (hasB2BRelation) {
            const customerPageId = relationObj.relation[0].id;
            try {
                const custRes = await fetch(`https://api.notion.com/v1/pages/${customerPageId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${NOTION_TOKEN}`,
                        'Notion-Version': '2022-06-28'
                    }
                });

                const custData = await custRes.json();
                if (custData && custData.properties) {
                    const custProps = custData.properties;
                    customerTotalBalance = getPropValByKeyword(custProps, 'Current Balance');
                    
                    const profUsed = getPropValByKeyword(custProps, 'Points Used');
                    if (profUsed && profUsed !== "0") pointsUsed = profUsed;
                }
            } catch (custErr) {
                console.error("Error fetching Customer Profile Page:", custErr);
            }
        }

        const result = {
            'Name': customerName,
            'BlueBox': parseProp(pageProps['လက်ရှိအခြေအနေ']),
            'BadgeStatus': parseProp(pageProps['Status']),
            'Route': parseProp(pageProps['Route']),
            'Weight': weightVal,
            'Cost': finalCost,
            'ETA': parseProp(pageProps['ETA']),
            'MPointEarned': mPointEarned,
            'PointsUsed': pointsUsed,
            'CustomerTotalBalance': customerTotalBalance,
            'HasB2B': hasB2BRelation
        };

        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ error: "Server Error", details: error.message });
    }
}
