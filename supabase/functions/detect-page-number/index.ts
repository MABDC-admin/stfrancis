import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface PageDetectionRequest {
  imageUrl: string;
  pageIndex: number;
  bookId?: string;
  pageId?: string;
}

interface PageDetectionResult {
  pageIndex: number;
  detectedPageNumber: string | null;
  pageType: 'numbered' | 'cover' | 'blank' | 'unknown';
  confidence: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageUrl, pageIndex, bookId, pageId } = await req.json() as PageDetectionRequest;
    
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if already detected in DB
    if (pageId) {
      const { data: existing } = await supabase
        .from('book_pages')
        .select('detected_page_number, page_type, detection_confidence, detection_completed')
        .eq('id', pageId)
        .single();

      if (existing?.detection_completed) {
        console.log(`Page ${pageIndex} already detected, returning cached result`);
        return new Response(
          JSON.stringify({
            pageIndex,
            detectedPageNumber: existing.detected_page_number,
            pageType: existing.page_type || 'unknown',
            confidence: existing.detection_confidence || 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing page at index ${pageIndex}: ${imageUrl.substring(0, 100)}...`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a page number detection assistant. Analyze book page images to detect the printed page number. 
            
Your task:
1. Look for printed page numbers (usually at corners, header, or footer of the page)
2. Identify if this is a cover page (front cover, back cover, title page with book title/author)
3. Identify if this is a blank page (mostly white/empty)
4. For numbered pages, extract the exact page number shown

Respond with a JSON object only, no markdown:
{
  "detectedPageNumber": "1" or null if not found,
  "pageType": "numbered" | "cover" | "blank" | "unknown",
  "confidence": 0.0 to 1.0
}`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this book page image and detect the page number if present. Return the result as JSON."
              },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI analysis failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log(`AI response for page ${pageIndex}:`, content);

    let result: PageDetectionResult = {
      pageIndex,
      detectedPageNumber: null,
      pageType: 'unknown',
      confidence: 0
    };

    try {
      let jsonStr = content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      
      const parsed = JSON.parse(jsonStr);
      result = {
        pageIndex,
        detectedPageNumber: parsed.detectedPageNumber || null,
        pageType: parsed.pageType || 'unknown',
        confidence: parsed.confidence || 0
      };
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
    }

    // Persist result to database
    if (pageId) {
      const { error: updateError } = await supabase
        .from('book_pages')
        .update({
          detected_page_number: result.detectedPageNumber,
          page_type: result.pageType,
          detection_confidence: result.confidence,
          detection_completed: true,
        })
        .eq('id', pageId);

      if (updateError) {
        console.error("Failed to persist detection result:", updateError);
      } else {
        console.log(`Persisted detection for page ${pageIndex} (${pageId})`);
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in detect-page-number:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
