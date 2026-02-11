import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { imageUrl } = await req.json();
    
    if (!imageUrl) {
      throw new Error("imageUrl is required");
    }

    console.log("Analyzing UI design with Gemini 3 Pro...");

    const analysisPrompt = `You are a UI/UX design expert. Analyze this dashboard UI design image and extract EXACT design specifications as JSON.

Return a JSON object with these exact properties (use precise hex codes and CSS values):

{
  "pageBackground": {
    "type": "gradient",
    "direction": "135deg",
    "colors": ["#hex1", "#hex2", "#hex3"],
    "cssValue": "linear-gradient(135deg, #hex1 0%, #hex2 50%, #hex3 100%)"
  },
  "cards": {
    "backgroundColor": "rgba(255,255,255,0.9)",
    "backdropBlur": "12px",
    "borderRadius": "24px",
    "boxShadow": "0 8px 32px rgba(0,0,0,0.12)",
    "border": "1px solid rgba(255,255,255,0.2)"
  },
  "statsCards": {
    "students": { 
      "backgroundColor": "#hex", 
      "iconBg": "rgba(255,255,255,0.2)",
      "textColor": "#FFFFFF"
    },
    "teachers": { 
      "backgroundColor": "#hex", 
      "iconBg": "rgba(255,255,255,0.2)",
      "textColor": "#FFFFFF"
    },
    "classes": { 
      "backgroundColor": "#hex", 
      "iconBg": "rgba(255,255,255,0.2)",
      "textColor": "#FFFFFF"
    },
    "library": { 
      "backgroundColor": "#hex", 
      "iconBg": "rgba(255,255,255,0.2)",
      "textColor": "#FFFFFF"
    }
  },
  "calendarHeader": {
    "gradient": "linear-gradient(135deg, #hex1, #hex2)",
    "textColor": "#FFFFFF",
    "borderRadius": "16px 16px 0 0"
  },
  "quickActions": {
    "backgroundColor": "rgba(255,255,255,0.9)",
    "iconBgOpacity": "0.1",
    "borderRadius": "16px",
    "boxShadow": "0 4px 16px rgba(0,0,0,0.08)"
  },
  "bottomActions": {
    "backgroundColor": "rgba(255,255,255,0.9)",
    "accentCardBg": "#hex",
    "borderRadius": "16px"
  },
  "typography": {
    "headerWeight": 700,
    "statNumberSize": "2rem",
    "labelSize": "0.75rem"
  }
}

IMPORTANT: 
- Extract the EXACT colors you see in the image
- For gradients, identify all color stops
- For glassmorphism effects, estimate the blur and opacity values
- Return ONLY valid JSON, no markdown formatting`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: analysisPrompt },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content returned from AI");
    }

    console.log("AI response received, parsing design tokens...");

    // Parse the JSON from the response
    let designTokens;
    try {
      // Try to extract JSON from the response (handle markdown code blocks if present)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, content];
      const jsonStr = jsonMatch[1] || content;
      designTokens = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Return default theme if parsing fails
      designTokens = getDefaultClassicBlueTheme();
    }

    console.log("Design tokens extracted successfully");

    return new Response(JSON.stringify({ 
      success: true, 
      designTokens 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("analyze-ui-design error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      designTokens: getDefaultClassicBlueTheme()
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getDefaultClassicBlueTheme() {
  return {
    pageBackground: {
      type: "gradient",
      direction: "135deg",
      colors: ["#4F46E5", "#2563EB", "#0EA5E9"],
      cssValue: "linear-gradient(135deg, #4F46E5 0%, #2563EB 50%, #0EA5E9 100%)"
    },
    cards: {
      backgroundColor: "rgba(255,255,255,0.95)",
      backdropBlur: "12px",
      borderRadius: "24px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      border: "1px solid rgba(255,255,255,0.3)"
    },
    statsCards: {
      students: { 
        backgroundColor: "#22C55E", 
        iconBg: "rgba(255,255,255,0.2)",
        textColor: "#FFFFFF"
      },
      teachers: { 
        backgroundColor: "#3B82F6", 
        iconBg: "rgba(255,255,255,0.2)",
        textColor: "#FFFFFF"
      },
      classes: { 
        backgroundColor: "#EAB308", 
        iconBg: "rgba(255,255,255,0.2)",
        textColor: "#FFFFFF"
      },
      library: { 
        backgroundColor: "#EF4444", 
        iconBg: "rgba(255,255,255,0.2)",
        textColor: "#FFFFFF"
      }
    },
    calendarHeader: {
      gradient: "linear-gradient(135deg, #3B82F6, #1D4ED8)",
      textColor: "#FFFFFF",
      borderRadius: "16px 16px 0 0"
    },
    quickActions: {
      backgroundColor: "rgba(255,255,255,0.95)",
      iconBgOpacity: "0.1",
      borderRadius: "16px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)"
    },
    bottomActions: {
      backgroundColor: "rgba(255,255,255,0.95)",
      accentCardBg: "#3B82F6",
      borderRadius: "16px"
    },
    typography: {
      headerWeight: 700,
      statNumberSize: "2rem",
      labelSize: "0.75rem"
    }
  };
}
