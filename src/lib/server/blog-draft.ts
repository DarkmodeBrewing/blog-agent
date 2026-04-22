import { zodResponsesFunction, zodTextFormat } from 'openai/helpers/zod';
import { GeneratedDraftSchema, type DraftRequest, type GeneratedDraft } from '../../openai/model';
import { systemsPrompt } from '../../openai/prompts';
import { existingPostToolSchema, invokeTool } from './invoke-tool-call';
import { getOpenAI } from './clients';
import { publishLog } from './log-stream';
import type { ResponseFunctionToolCall } from 'openai/resources/responses/responses.js';

const model = 'gpt-5.4';
const maxToolIterations = 3;
const draftTextFormat = zodTextFormat(GeneratedDraftSchema, 'blog_draft');
type DraftTool = ReturnType<typeof zodResponsesFunction<typeof existingPostToolSchema>>;

export const generateBlogDraft = async (
  draftRequest: DraftRequest
): Promise<GeneratedDraft | null> => {
  const instructions = `${systemsPrompt}`;
  const input = `Write a blog post draft from this request:\n${JSON.stringify(draftRequest, null, 2)}`;

  const tools: DraftTool[] = [];

  if (draftRequest.referencePostSlugs && draftRequest.referencePostSlugs.length > 0) {
    tools.push(
      zodResponsesFunction({
        name: 'get_existing_post',
        description: 'Get an existing blog post by slug',
        parameters: existingPostToolSchema
      })
    );
  }

  let response = await getOpenAI().responses.parse({
    model,
    instructions,
    input,
    tools,
    text: {
      format: draftTextFormat
    }
  });

  for (let iteration = 0; iteration < maxToolIterations; iteration++) {
    const toolCalls = response.output.filter((o) => o.type === 'function_call');

    if (toolCalls.length === 0) {
      return response.output_parsed;
    }

    publishLog({
      level: 'info',
      message: `${model}, is requesting tool(s)`,
      details: toolCalls
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

        const output = await invokeTool(call.name, args.value);

        return {
          type: 'function_call_output' as const,
          call_id: call.call_id,
          output: JSON.stringify(output)
        };
      })
    );

    response = await getOpenAI().responses.parse({
      model,
      previous_response_id: response.id,
      input: toolOutputs,
      text: {
        format: draftTextFormat
      }
    });
  }

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
