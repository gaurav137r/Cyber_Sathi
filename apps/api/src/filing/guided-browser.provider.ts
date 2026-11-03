import { Injectable } from "@nestjs/common"
import {
  GuidedHandoff,
  FilingPreview,
  PortalSubmissionProvider,
} from "./portal-submission.provider"

@Injectable()
export class GuidedBrowserProvider implements PortalSubmissionProvider {
  async createGuidedHandoff(preview: FilingPreview): Promise<GuidedHandoff> {
    return {
      mode: "GUIDED_BROWSER_HANDOFF",
      url: preview.destinationUrl,
      instructions: [
        "Open the official portal in the mobile in-app browser.",
        "Review and manually paste the preview data into the portal form.",
        "Complete any portal OTP/CAPTCHA and submit only after reviewing the official portal screen.",
        "Return to CyberSathi and record the acknowledgment/tracking number.",
      ],
    }
  }
}
