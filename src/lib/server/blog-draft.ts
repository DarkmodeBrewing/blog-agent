import { zodResponsesFunction, zodTextFormat } from 'openai/helpers/zod';
import { randomUUID } from 'node:crypto';
import { GeneratedDraftSchema, type DraftRequest, type GeneratedDraft } from '../../openai/model';
import { existingPostToolSchema, invokeTool } from './invoke-tool-call';
import { getOpenAI } from './clients';
import type {
  ParsedResponse,
  ResponseFunctionToolCall
} from 'openai/resources/responses/responses.js';
import { createDraftFromGeneration } from './post-library';
import { getSelectedModel, getSystemPrompt } from './prompt-settings';
import { recordTokenUsage } from './token-usage';
import { getErrorMessage, hashText, logWorkflow } from './workflow-log';

const maxToolIterations = 3;
const draftTextFormat = zodTextFormat(GeneratedDraftSchema, 'blog_draft');
type DraftTool = ReturnType<typeof zodResponsesFunction<typeof existingPostToolSchema>>;

export const generateBlogDraft = async (
  draftRequest: DraftRequest
): Promise<GeneratedDraft | null> => {
  const sessionId = randomUUID();
  const model = getSelectedModel();
  const instructions = getSystemPrompt();
  const input = `Write a blog post draft from this request:\n${JSON.stringify(draftRequest, null, 2)}`;
  const allowedReferenceSlugs = draftRequest.referencePostSlugs ?? [];

  const tools: DraftTool[] = [];

  logWorkflow({
    level: 'info',
    message: 'generation.started',
    details: {
      topic: draftRequest.topic,
      desiredLength: draftRequest.desiredLength,
      category: draftRequest.category ?? null,
      keywordCount: draftRequest.keywords?.length ?? 0,
      tagCount: draftRequest.tags?.length ?? 0,
      referencePostCount: allowedReferenceSlugs.length,
      sessionId,
      systemPromptLength: instructions.length,
      systemPromptHash: hashText(instructions)
    }
  });

  if (allowedReferenceSlugs.length > 0) {
    logWorkflow({
      level: 'info',
      message: 'generation.references.selected',
      details: {
        slugs: allowedReferenceSlugs
      }
    });
  }

  if (allowedReferenceSlugs.length > 0) {
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
      model,
      instructions,
      input,
      tools,
      text: {
        format: draftTextFormat
      }
    });
    recordTokenUsage({
      sessionId,
      operation: 'blog_draft_generation',
      stage: 'initial_model_response',
      model,
      responseId: response.id,
      usage: response.usage
    });
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'generation.failed',
      details: {
        stage: 'initial_model_response',
        sessionId,
        error: getErrorMessage(cause)
      }
    });

    throw cause;
  }

  for (let iteration = 0; iteration < maxToolIterations; iteration++) {
    const toolCalls = response.output.filter((o) => o.type === 'function_call');

    if (toolCalls.length === 0) {
      if (response.output_parsed) {
        createDraftFromGeneration(response.output_parsed, draftRequest, model, input);
      }

      logWorkflow({
        level: response.output_parsed ? 'info' : 'warn',
        message: 'generation.model.completed',
        details: {
          model,
          parsed: Boolean(response.output_parsed),
          responseId: response.id,
          sessionId
        }
      });

      return response.output_parsed;
    }

    logWorkflow({
      level: 'info',
      message: 'generation.tools.requested',
      details: {
        model,
        sessionId,
        toolCount: toolCalls.length,
        toolNames: toolCalls.map((call) => call.name)
      }
    });

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
        model,
        previous_response_id: response.id,
        input: toolOutputs,
        text: {
          format: draftTextFormat
        }
      });
      recordTokenUsage({
        sessionId,
        operation: 'blog_draft_generation',
        stage: `tool_followup_response_${iteration + 1}`,
        model,
        responseId: response.id,
        usage: response.usage
      });
    } catch (cause) {
      logWorkflow({
        level: 'error',
        message: 'generation.failed',
        details: {
          stage: 'tool_followup_response',
          sessionId,
          iteration,
          error: getErrorMessage(cause)
        }
      });

      throw cause;
    }
  }

  logWorkflow({
    level: 'error',
    message: 'generation.failed',
    details: {
      stage: 'tool_iterations_exceeded',
      sessionId,
      maxToolIterations
    }
  });

  throw new Error('Model exceeded the maximum number of tool iterations');
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
