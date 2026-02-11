const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface DesignSearchRequest {
  topic: string;
  style: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, style } = await req.json() as DesignSearchRequest;

    if (!topic) {
      return new Response(
        JSON.stringify({ success: false, error: 'Topic is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build search queries for design inspiration
    const styleDescription = {
      modern: 'modern minimal clean',
      corporate: 'professional corporate business',
      creative: 'creative colorful vibrant',
      academic: 'academic scholarly educational',
      dark: 'dark mode tech futuristic',
    }[style] || 'modern';

    // Search for presentation design inspiration
    const searchQueries = [
      `${topic} presentation design ${styleDescription} site:dribbble.com OR site:behance.net`,
      `${topic} slide design inspiration ${styleDescription}`,
    ];

    console.log('Searching for design inspiration:', searchQueries[0]);

    // Execute primary search
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQueries[0],
        limit: 5,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Firecrawl API error:', response.status, errorData);
      
      // Return empty results instead of failing - presentation can still work without inspiration
      return new Response(
        JSON.stringify({ 
          success: true, 
          inspiration: [],
          message: 'Could not fetch design inspiration, proceeding without it'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Firecrawl search successful, results:', data.data?.length || 0);

    // Extract relevant design insights from search results
    const inspiration = (data.data || []).map((result: any) => ({
      title: result.title || 'Design Inspiration',
      url: result.url,
      snippet: result.description || '',
      content: result.markdown?.slice(0, 500) || '', // Limit content size
    }));

    // Also search for relevant facts/statistics about the topic
    let topicFacts: any[] = [];
    try {
      const factsResponse = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `${topic} statistics facts data 2024 2025`,
          limit: 3,
          scrapeOptions: {
            formats: ['markdown'],
            onlyMainContent: true,
          },
        }),
      });

      if (factsResponse.ok) {
        const factsData = await factsResponse.json();
        topicFacts = (factsData.data || []).map((result: any) => ({
          title: result.title || 'Topic Research',
          url: result.url,
          content: result.markdown?.slice(0, 800) || result.description || '',
        }));
        console.log('Topic facts fetched:', topicFacts.length);
      }
    } catch (err) {
      console.log('Could not fetch topic facts, continuing without them');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        inspiration,
        topicFacts,
        designTips: getDesignTips(style),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in design search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search';
    
    // Return graceful failure - allow presentation to proceed without inspiration
    return new Response(
      JSON.stringify({ 
        success: true, 
        inspiration: [],
        topicFacts: [],
        message: errorMessage
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getDesignTips(style: string): string[] {
  const tips: Record<string, string[]> = {
    modern: [
      'Use generous white space and clean typography',
      'Limit to 2-3 colors with bold accents',
      'Large hero images with minimal text overlay',
      'Geometric shapes and subtle gradients',
      'Sans-serif fonts like Inter, Helvetica, or Montserrat',
    ],
    corporate: [
      'Professional navy, gray, and white color scheme',
      'Clear hierarchy with structured layouts',
      'Data visualizations and charts for credibility',
      'Consistent branding elements throughout',
      'Conservative typography with Arial or Calibri',
    ],
    creative: [
      'Bold color combinations and gradients',
      'Asymmetric layouts for visual interest',
      'Hand-drawn elements or illustrations',
      'Playful typography mixing styles',
      'Dynamic shapes and overlapping elements',
    ],
    academic: [
      'Clean, readable layouts with clear sections',
      'Serif fonts for formal appearance',
      'Diagrams and flowcharts for complex concepts',
      'Subtle color palette with one accent',
      'Citations and references formatted properly',
    ],
    dark: [
      'Dark backgrounds with high contrast text',
      'Neon or vibrant accent colors',
      'Glassmorphism and blur effects',
      'Tech-inspired geometric patterns',
      'Monospace fonts for code/tech content',
    ],
  };
  
  return tips[style] || tips.modern;
}
