#!/bin/bash
#
# Creates all required secrets in GCP Secret Manager for BCS FastAPI service.
# Run this once before deploying to Cloud Run.
#
# Usage:
#   GCP_PROJECT_ID=your-project-id ./setup-gcp-secrets.sh
#
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?Please set GCP_PROJECT_ID environment variable}"
REGION="${GCP_REGION:-us-central1}"

echo "Using project: ${PROJECT_ID}"
echo "Using region:  ${REGION}"
echo ""

# Enable required APIs
echo "Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com \
  --project="${PROJECT_ID}"

# Helper: create or update a secret
create_secret() {
  local name="$1"
  local prompt_msg="$2"

  echo ""
  printf "%s: " "${prompt_msg}"
  read -r value

  if [ -z "${value}" ]; then
    echo "  Skipping ${name} (empty value)"
    return
  fi

  # Check if secret exists
  if gcloud secrets describe "${name}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "  Secret '${name}' already exists, adding new version..."
  else
    echo "  Creating secret '${name}'..."
    gcloud secrets create "${name}" \
      --replication-policy="automatic" \
      --project="${PROJECT_ID}"
  fi

  echo -n "${value}" | gcloud secrets versions add "${name}" \
    --data-file=- \
    --project="${PROJECT_ID}"

  echo "  Done."
}

echo ""
echo "=== Creating secrets for BCS FastAPI service ==="
echo ""

create_secret "openai-api-key"          "Enter OPENAI_API_KEY"
create_secret "gemini-api-key"          "Enter GEMINI_API_KEY"
create_secret "anthropic-api-key"       "Enter ANTHROPIC_API_KEY (press Enter to skip)"
create_secret "aws-access-key-id"       "Enter AWS_ACCESS_KEY_ID"
create_secret "aws-secret-access-key"   "Enter AWS_SECRET_ACCESS_KEY"
create_secret "mongodb-url"             "Enter MONGODB_URL"

echo ""
echo "=== All secrets created ==="
echo ""
echo "Verify with:"
echo "  gcloud secrets list --project=${PROJECT_ID}"
echo ""
echo "Grant Cloud Run access to these secrets:"
echo "  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
echo "    --member='serviceAccount:github-deployer@${PROJECT_ID}.iam.gserviceaccount.com' \\"
echo "    --role='roles/secretmanager.secretAccessor'"
