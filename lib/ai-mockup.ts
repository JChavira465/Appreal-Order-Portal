import "server-only";

// gpt-image-1 is deprecating Oct 23 2026, so this targets OpenAI's
// current flagship image model instead. If OpenAI renames/replaces it
// again, this is the only place that needs to change. This project has
// no OpenAI SDK dependency -- a single fetch call doesn't need one.
//
// Note: this endpoint/request shape was verified via web search, not a
// live fetch of OpenAI's docs (platform.openai.com is blocked from this
// sandbox's network). Worth a smoke test once OPENAI_API_KEY is set.
const OPENAI_IMAGE_MODEL = "gpt-image-2";

export async function generateMockupImage(
  prompt: string,
): Promise<{ bytes: Buffer } | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      error: "AI concepts aren't set up yet -- ask the office to add an API key.",
    };
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });
  } catch {
    return { error: "Couldn't reach the image generator. Try again." };
  }

  if (!response.ok) {
    return { error: "Image generation failed -- try a different description." };
  }

  const json = await response.json();
  const b64: string | undefined = json?.data?.[0]?.b64_json;
  if (!b64) return { error: "Image generation returned nothing usable." };

  return { bytes: Buffer.from(b64, "base64") };
}
