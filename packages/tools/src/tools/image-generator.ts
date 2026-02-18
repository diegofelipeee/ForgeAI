import { createLogger } from '@forgeai/shared';
import { BaseTool, type ToolDefinition, type ToolResult } from '../base.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const logger = createLogger('Tool:ImageGenerator');

const GENERATED_DIR = resolve(process.cwd(), 'data', 'generated-images');

export class ImageGeneratorTool extends BaseTool {
  readonly definition: ToolDefinition = {
    name: 'image_generate',
    description: 'Generate images from text descriptions using DALL-E 3 (OpenAI) or Stable Diffusion (local). Returns the file path of the generated image.',
    category: 'utility',
    parameters: [
      { name: 'prompt', type: 'string', description: 'Text description of the image to generate', required: true },
      { name: 'provider', type: 'string', description: 'Image generation provider: "dalle" (default) or "stable-diffusion"', required: false },
      { name: 'size', type: 'string', description: 'Image size: "1024x1024" (default), "1792x1024", "1024x1792"', required: false },
      { name: 'quality', type: 'string', description: 'Image quality: "standard" (default) or "hd"', required: false },
      { name: 'style', type: 'string', description: 'Image style: "vivid" (default) or "natural"', required: false },
    ],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateParams(params);
    if (validation) return { success: false, error: validation, duration: 0 };

    const prompt = params['prompt'] as string;
    const provider = (params['provider'] as string) ?? 'dalle';
    const size = (params['size'] as string) ?? '1024x1024';
    const quality = (params['quality'] as string) ?? 'standard';
    const style = (params['style'] as string) ?? 'vivid';

    const { result, duration } = await this.timed(async () => {
      if (provider === 'stable-diffusion') {
        return this.generateStableDiffusion(prompt, size);
      }
      return this.generateDallE(prompt, size, quality, style);
    });

    return { ...result, duration };
  }

  private async generateDallE(prompt: string, size: string, quality: string, style: string): Promise<Omit<ToolResult, 'duration'>> {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      return { success: false, error: 'OPENAI_API_KEY not configured. Set it in Settings or environment.' };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size,
          quality,
          style,
          response_format: 'b64_json',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('DALL-E API error', { status: response.status, error });
        return { success: false, error: `DALL-E API error (${response.status}): ${error}` };
      }

      const data = await response.json() as {
        data: Array<{ b64_json: string; revised_prompt?: string }>;
      };

      const imageB64 = data.data[0]?.b64_json;
      if (!imageB64) {
        return { success: false, error: 'No image data in DALL-E response' };
      }

      const revisedPrompt = data.data[0]?.revised_prompt ?? prompt;
      const filePath = this.saveImage(imageB64, 'dalle');

      logger.info('Image generated with DALL-E 3', { size, quality, style, filePath });

      return {
        success: true,
        data: {
          filePath,
          provider: 'dall-e-3',
          size,
          quality,
          style,
          revisedPrompt,
          message: `Image generated successfully and saved to ${filePath}`,
        },
      };
    } catch (err) {
      logger.error('DALL-E generation failed', err);
      return { success: false, error: `DALL-E generation failed: ${(err as Error).message}` };
    }
  }

  private async generateStableDiffusion(prompt: string, size: string): Promise<Omit<ToolResult, 'duration'>> {
    // Stable Diffusion via local API (AUTOMATIC1111 WebUI or ComfyUI)
    const sdUrl = process.env['STABLE_DIFFUSION_URL'] ?? 'http://127.0.0.1:7860';

    const [width, height] = size.split('x').map(Number);

    try {
      const response = await fetch(`${sdUrl}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negative_prompt: 'blurry, bad quality, distorted, ugly',
          steps: 30,
          cfg_scale: 7,
          width: width || 1024,
          height: height || 1024,
          sampler_name: 'DPM++ 2M Karras',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Stable Diffusion API error (${response.status}): ${error}` };
      }

      const data = await response.json() as { images: string[] };
      const imageB64 = data.images?.[0];
      if (!imageB64) {
        return { success: false, error: 'No image data in Stable Diffusion response' };
      }

      const filePath = this.saveImage(imageB64, 'sd');

      logger.info('Image generated with Stable Diffusion', { size, filePath });

      return {
        success: true,
        data: {
          filePath,
          provider: 'stable-diffusion',
          size,
          message: `Image generated successfully and saved to ${filePath}`,
        },
      };
    } catch (err) {
      logger.error('Stable Diffusion generation failed', err);
      return {
        success: false,
        error: `Stable Diffusion not available at ${sdUrl}. Make sure AUTOMATIC1111 WebUI is running with --api flag, or set STABLE_DIFFUSION_URL.`,
      };
    }
  }

  private saveImage(base64Data: string, prefix: string): string {
    if (!existsSync(GENERATED_DIR)) {
      mkdirSync(GENERATED_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${prefix}-${timestamp}.png`;
    const filePath = resolve(GENERATED_DIR, filename);

    writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    return filePath;
  }
}
