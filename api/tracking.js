export default async function handler(req, res) {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "ID is required" });

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const TRACKING_DB_ID = process.env.NOTION_DATABASE_ID;
    const CUSTOMER_DB_ID = process.env.NOTION_CUSTOMER_DATABASE_ID;

    try {
        // 1. Fetch Order from Tracking DB
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

        const page = trackingData.results[0].properties;

        // Accurate Value Extractor
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

        // Price Priority Logic
        let finalCost = parseProp(page['Total Cost (Baht) - Final']);
        if (!finalCost || finalCost === "0") finalCost = parseProp(page['Total Cost (Baht)']);
        if (!finalCost || finalCost === "0") finalCost = parseProp(page['Total Cost (Baht) - Locked']);

        // Directly fetch 'M Point Earn' from Tracking DB
        const mPointEarned = parseProp(page['M Point Earn']);

        // Check B2B Customer Relation Link
        const profileRelation = page['MAI CARGO - B2B Customer Profiles'];
        const hasB2BRelation = profileRelation && profileRelation.relation && profileRelation.relation.length > 0;

        let pointsUsed = parseProp(page['Points Used']);
        let customerTotalBalance = "0";

        // 2. Fetch Customer Profiles Database directly using B2B Page ID
        if (hasB2BRelation) {
            const customerPageId = profileRelation.relation[0].id;
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
                    customerTotalBalance = parseProp(custProps['Current Balance']);
                    
                    // Fallback to Profile DB Points Used if present
                    const profUsed = parseProp(custProps['Points Used']);
                    if (profUsed && profUsed !== "0") pointsUsed = profUsed;
                }
            } catch (custErr) {
                console.error("Error fetching Customer Profile:", custErr);
            }
        }

        const result = {
            'Name': parseProp(page['Name']),
            'BlueBox': parseProp(page['လက်ရှိအခြေအနေ']),
            'BadgeStatus': parseProp(page['Status']),
            'Route': parseProp(page['Route']),
            'Weight': parseProp(page['Weight (kg)']),
            'Cost': finalCost,
            'ETA': parseProp(page['ETA']),
            'MPointEarned': mPointEarned,
            'PointsUsed': pointsUsed,
            'CustomerTotalBalance': customerTotalBalance,
            'HasB2B': hasB2BRelation
        };

        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ error: "Server Error" });
    }
}
