import { classificationCategories } from "../classification/classification.types"

import { evidenceCategories } from "./case-interactions.dto"

import { sathiChannels } from "./sathi.types"

export const sathiFunctionDeclarations = [
  {
    name: "get_case_state",

    description:
      "Read the latest confirmed fields, extracted evidence fields, pending requests and processing status for this case before asking the next question.",

    parameters: { type: "object", properties: {} },
  },

  {
    name: "request_case_evidence",

    description:
      "Note that the user should upload one supported evidence category. Tell the user to tap the Upload button in this chat; never claim a file picker opened automatically. The backend extracts the fields after upload and returns them to this chat.",

    parameters: {
      type: "object",

      properties: {
        category: { type: "string", enum: [...evidenceCategories] },
      },

      required: ["category"],
    },
  },

  {
    name: "request_case_review",

    description: "Show the user an editable review of the current case revision.",

    parameters: { type: "object", properties: {} },
  },

  {
    name: "save_incident_facts",

    description:
      "Save facts the victim has clearly stated. Omit fields that were not mentioned.",

    parameters: {
      type: "object",

      properties: {
        narrative: {
          type: "string",
          description: "Incident story in the victim's words",
        },

        incidentAt: {
          type: "string",
          description: "ISO-8601 date or a human date/time the user gave",
        },

        amount: { type: "number", description: "Amount lost in INR" },

        channel: { type: "string", enum: [...sathiChannels] },

        suspectPhone: { type: "string" },

        victimPhone: { type: "string" },

        upiId: { type: "string" },

        bankOrApp: { type: "string" },

        url: { type: "string" },

        transactionIds: { type: "array", items: { type: "string" } },

        description: { type: "string" },
      },
    },
  },

  {
    name: "set_fraud_category",

    description: "Classify the incident and choose the filing portal category.",

    parameters: {
      type: "object",

      properties: {
        category: { type: "string", enum: [...classificationCategories] },

        confidence: { type: "number" },

        explanation: { type: "string" },
      },

      required: ["category", "confidence", "explanation"],
    },
  },

  {
    name: "request_device_phone_picker",

    description:
      "Ask the app to let the user choose which phone number called or messaged them.",

    parameters: {
      type: "object",

      properties: {
        source: { type: "string", enum: ["CALL", "SMS", "EITHER"] },

        prompt: { type: "string" },

        candidates: {
          type: "array",
          items: { type: "string" },
          description: "Numbers already mentioned in the conversation",
        },
      },

      required: ["source", "prompt"],
    },
  },

  {
    name: "mark_missing_fields",

    description: "Record which report fields are still missing.",

    parameters: {
      type: "object",

      properties: {
        missingFields: { type: "array", items: { type: "string" } },

        nextQuestion: { type: "string" },
      },

      required: ["missingFields", "nextQuestion"],
    },
  },

  {
    name: "complete_intake",

    description:
      "Mark intake ready for the user to review a draft report. Do not call until the story, category, and key identifiers are present.",

    parameters: {
      type: "object",

      properties: {
        summary: { type: "string" },
      },

      required: ["summary"],
    },
  },
]
