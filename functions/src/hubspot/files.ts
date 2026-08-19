import { getHubspotClient } from "./client";

/**
 * Uploads a file to HubSpot's Files API and associates it with the deal
 * (section 9 "Escritura de vuelta"). Returns the file's public/absolute URL
 * so it can be stored on the deal property and on the Firestore document.
 *
 * TODO: confirm the target HubSpot file folder path with the team once the
 * private app + folder structure for this project is provisioned.
 */
export async function uploadDealFile(
  _dealId: string,
  fileName: string,
  fileBuffer: Buffer,
  options?: { folderPath?: string },
): Promise<{ fileId: string; url: string }> {
  const hubspot = getHubspotClient();
  const folderPath = options?.folderPath ?? "aviva-pay-desk";

  const upload = await hubspot.files.filesApi.upload(
    { data: fileBuffer, name: fileName }, // file
    undefined, // folderId
    folderPath,
    fileName,
    undefined, // charsetHunch
    JSON.stringify({ access: "PRIVATE", overwrite: false }), // options
  );

  return {
    fileId: upload.id,
    url: upload.url,
  };
}
