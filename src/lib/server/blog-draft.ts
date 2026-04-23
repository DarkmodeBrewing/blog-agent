import { zodResponsesFunction, zodTextFormat } from 'openai/helpers/zod';
import { randomUUID } from 'node:crypto';
import {
  createGeneratedDraftSchema,
  GeneratedSocialVariantSchema,
  type BlogFrontmatterPreference,
  type DraftRequest,
  type GeneratedDraft,
  type GeneratedSocialVariant,
  type GenerationOutputSchema
} from '../../openai/model';
import { buildDerivedSocialInput, buildPrimaryDraftInput } from '../../openai/prompts';
import { existingPostToolSchema, invokeTool } from './invoke-tool-call';
import { getOpenAI } from './clients';
import type {
  ParsedResponse,
  ResponseFunctionToolCall
} from 'openai/resources/responses/responses.js';
import { createDraftFromGeneration, createVariantDraftFromGeneration } from './post-library';
import { getSelectedModel, getSystemPrompt } from './prompt-settings';
import { recordTokenUsage } from './token-usage';
import { getErrorMessage, hashText, logWorkflow } from './workflow-log';

const maxToolIterations = 3;
const socialVariantTextFormat = zodTextFormat(
  GeneratedSocialVariantSchema,
  'derived_social_variant'
);
type DraftTool = ReturnType<typeof zodResponsesFunction<typeof existingPostToolSchema>>;

export type GeneratedBundleResult = {
  primary: GeneratedDraft;
  variants: GeneratedSocialVariant[];
};

type GenerationOutput = (typeof GenerationOutputSchema)['_zod']['output'];

export const generateContentBundle = async (
  draftRequest: DraftRequest
): Promise<GeneratedBundleResult | null> => {
  const outputs: GenerationOutput[] = draftRequest.outputs.includes('blog')
    ? [
        'blog',
        ...draftRequest.outputs.filter(
          (output): output is Exclude<GenerationOutput, 'blog'> => output !== 'blog'
        )
      ]
    : ['blog', ...draftRequest.outputs];
  const sessionId = randomUUID();
  const model = getSelectedModel();
  const instructions = getSystemPrompt();

  logWorkflow({
    level: 'info',
    message: 'generation.started',
    details: {
      topic: draftRequest.topic,
      outputs,
      desiredLength: draftRequest.desiredLength,
      category: draftRequest.category ?? null,
      keywordCount: draftRequest.keywords?.length ?? 0,
      tagCount: draftRequest.tags?.length ?? 0,
      referencePostCount: draftRequest.referencePostSlugs?.length ?? 0,
      sessionId,
      systemPromptLength: instructions.length,
      systemPromptHash: hashText(instructions)
    }
  });

  const primary = await generatePrimaryBlogDraft(draftRequest, {
    sessionId,
    model,
    instructions
  });

  if (!primary) {
    return null;
  }

  const variants: GeneratedSocialVariant[] = [];

  for (const output of outputs) {
    if (output === 'blog') continue;

    const variant = await generateDerivedVariant(output, draftRequest, primary, {
      sessionId,
      model,
      instructions
    });

    variants.push(variant);
  }

  return {
    primary,
    variants
  };
};

const generatePrimaryBlogDraft = async (
  draftRequest: DraftRequest,
  context: { sessionId: string; model: string; instructions: string }
): Promise<GeneratedDraft | null> => {
  const input = buildPrimaryDraftInput(draftRequest);
  const draftSchema = createGeneratedDraftSchema(
    (draftRequest.blogPreferences?.frontmatter ?? {}) as BlogFrontmatterPreference
  );
  const draftTextFormat = zodTextFormat(draftSchema, 'blog_draft');
  const allowedReferenceSlugs = draftRequest.referencePostSlugs ?? [];
  const tools: DraftTool[] = [];

  if (allowedReferenceSlugs.length > 0) {
    logWorkflow({
      level: 'info',
      message: 'generation.references.selected',
      details: {
        slugs: allowedReferenceSlugs
      }
    });

    tools.push(
      zodResponsesFunction({
        name: 'get_existing_post',
        description: 'Get an existing blog post by slug',
        parameters: existingPostToolSchema
      })
    );
  }

  let response: ParsedResponse<GeneratedDraft>;

  try {
    response = await getOpenAI().responses.parse({
      model: context.model,
      instructions: context.instructions,
      input,
      tools,
      text: {
        format: draftTextFormat
      }
    });
    recordTokenUsage({
      sessionId: context.sessionId,
      operation: 'bundle_generation',
      stage: 'primary_blog_initial_response',
      model: context.model,
      responseId: response.id,
      usage: response.usage
    });
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'generation.failed',
      details: {
        stage: 'primary_blog_initial_response',
        sessionId: context.sessionId,
        error: getErrorMessage(cause)
      }
    });

    throw cause;
  }

  for (let iteration = 0; iteration < maxToolIterations; iteration++) {
    const toolCalls = response.output.filter((output) => output.type === 'function_call');

    if (toolCalls.length === 0) {
      if (response.output_parsed) {
        createDraftFromGeneration(response.output_parsed, draftRequest, context.model, input);
      }

      logWorkflow({
        level: response.output_parsed ? 'info' : 'warn',
        message: 'generation.primary.completed',
        details: {
          model: context.model,
          parsed: Boolean(response.output_parsed),
          responseId: response.id,
          sessionId: context.sessionId
        }
      });

      return response.output_parsed;
    }

    const toolOutputs = await Promise.all(
      toolCalls.map(async (call) => {
        const args = parseToolArguments(call);

        if (!args.ok) {
          return {
            type: 'function_call_output' as const,
            call_id: call.call_id,
            output: JSON.stringify({
              error: 'Malformed tool arguments',
              details: args.error
            })
          };
        }

        const output = await invokeTool(call.name, args.value, allowedReferenceSlugs);

        return {
          type: 'function_call_output' as const,
          call_id: call.call_id,
          output: JSON.stringify(output)
        };
      })
    );

    try {
      response = await getOpenAI().responses.parse({
        model: context.model,
        previous_response_id: response.id,
        input: toolOutputs,
        text: {
          format: draftTextFormat
        }
      });
      recordTokenUsage({
        sessionId: context.sessionId,
        operation: 'bundle_generation',
        stage: `primary_blog_tool_followup_${iteration + 1}`,
        model: context.model,
        responseId: response.id,
        usage: response.usage
      });
    } catch (cause) {
      logWorkflow({
        level: 'error',
        message: 'generation.failed',
        details: {
          stage: 'primary_blog_tool_followup',
          sessionId: context.sessionId,
          iteration,
          error: getErrorMessage(cause)
        }
      });

      throw cause;
    }
  }

  throw new Error('Model exceeded the maximum number of tool iterations');
};

const generateDerivedVariant = async (
  platform: 'x' | 'linkedin',
  draftRequest: DraftRequest,
  primary: GeneratedDraft,
  context: { sessionId: string; model: string; instructions: string }
) => {
  const input = buildDerivedSocialInput({
    platform,
    request: draftRequest,
    blogDraft: {
      title: primary.title,
      slug: primary.slug,
      ingress: primary.ingress,
      body: primary.body,
      tags: primary.tags ?? []
    }
  });

  let response: ParsedResponse<GeneratedSocialVariant>;

  try {
    response = await getOpenAI().responses.parse({
      model: context.model,
      instructions: context.instructions,
      input,
      text: {
        format: socialVariantTextFormat
      }
    });
    recordTokenUsage({
      sessionId: context.sessionId,
      operation: 'bundle_generation',
      stage: `derived_${platform}_response`,
      model: context.model,
      responseId: response.id,
      usage: response.usage
    });
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'generation.failed',
      details: {
        stage: `derived_${platform}_response`,
        sessionId: context.sessionId,
        error: getErrorMessage(cause)
      }
    });

    throw cause;
  }

  if (!response.output_parsed) {
    throw new Error(`Model did not return a valid ${platform} variant`);
  }

  createVariantDraftFromGeneration(
    {
      parentSlug: primary.slug,
      variant: response.output_parsed,
      body: response.output_parsed.body
    },
    draftRequest,
    context.model,
    input
  );

  logWorkflow({
    level: 'info',
    message: 'generation.variant.completed',
    details: {
      parentSlug: primary.slug,
      platform,
      responseId: response.id,
      sessionId: context.sessionId
    }
  });

  return response.output_parsed;
};

const parseToolArguments = (
  call: ResponseFunctionToolCall
): { ok: true; value: unknown } | { ok: false; error: string } => {
  try {
    return {
      ok: true,
      value: JSON.parse(call.arguments) as unknown
    };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Unknown JSON parse error'
    };
  }
};
