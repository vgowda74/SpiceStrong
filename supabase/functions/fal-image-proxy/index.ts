const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type FalModel = 'schnell' | 'dev';

const FAL_MODEL_PATHS: Record<FalModel, string> = {
  schnell: 'fal-ai/flux/schnell',
  dev: 'fal-ai/flux/dev',
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runFalImage(prompt: string, label: string, model: FalModel) {
  const falKey = Deno.env.get('FAL_KEY');
  if (!falKey) return { status: 500, body: { url: null, error: 'FAL_KEY is not configured' } };

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[SpiceStrong] fal.ai request for "${label}" (attempt ${attempt + 1}/${maxRetries + 1})`);

      const submitRes = await fetch(`https://queue.fal.run/${FAL_MODEL_PATHS[model]}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${falKey}`,
        },
        body: JSON.stringify({
          prompt,
          image_size: 'square_hd',
          num_images: 1,
          enable_safety_checker: false,
        }),
      });

      if (!submitRes.ok) {
        const text = await submitRes.text().catch(() => '');
        console.warn(`[SpiceStrong] fal.ai submit error ${submitRes.status}: ${text}`);
        if (submitRes.status === 429 && attempt < maxRetries) {
          await delay(5000);
          continue;
        }
        return { status: submitRes.status, body: { url: null, error: `fal.ai ${submitRes.status}` } };
      }

      const submitData = await submitRes.json().catch(() => null);
      if (!submitData) return { status: 502, body: { url: null, error: 'Invalid response from fal.ai' } };

      if (submitData.images?.[0]?.url) {
        return { status: 200, body: { url: submitData.images[0].url } };
      }

      const responseUrl = submitData.response_url;
      if (!responseUrl) return { status: 502, body: { url: null, error: 'No response_url from fal.ai' } };

      const maxWait = 60000;
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await delay(pollInterval);
        const pollRes = await fetch(responseUrl, {
          headers: { Authorization: `Key ${falKey}` },
        });

        if (!pollRes.ok) {
          const text = await pollRes.text().catch(() => '');
          console.warn(`[SpiceStrong] fal.ai poll error ${pollRes.status}: ${text}`);
          continue;
        }

        const pollData = await pollRes.json().catch(() => null);
        if (!pollData) continue;

        if (pollData.images?.[0]?.url) {
          return { status: 200, body: { url: pollData.images[0].url } };
        }

        if (pollData.status === 'IN_QUEUE' || pollData.status === 'IN_PROGRESS') continue;

        if (pollData.status === 'COMPLETED' && !pollData.images?.[0]?.url) {
          return { status: 502, body: { url: null, error: 'No image in completed response' } };
        }
      }

      return { status: 504, body: { url: null, error: 'Timed out waiting for fal.ai' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      console.warn(`[SpiceStrong] fal.ai proxy error for "${label}": ${message}`);
      if (attempt < maxRetries) {
        await delay(3000);
        continue;
      }
      return { status: 500, body: { url: null, error: message } };
    }
  }

  return { status: 500, body: { url: null, error: 'Max retries exceeded' } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const label = typeof body?.label === 'string' ? body.label : 'image';
    const requestedModel = body?.model === 'dev' ? 'dev' : 'schnell';

    if (!prompt) {
      return new Response(JSON.stringify({ url: null, error: 'Prompt is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await runFalImage(prompt, label, requestedModel);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected proxy error';
    return new Response(JSON.stringify({ url: null, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
