import { NextResponse } from "next/server";
import {
  createProjectFromUploads,
  getPublicProjectStatus,
  ProjectUploadValidationError,
  validateProjectDisplayName,
  validateProjectUploadDescriptors,
  type ProjectUploadDescriptor,
  type ProjectUploadFile
} from "@/server/projects";
import { ensureGenerationWorkerStarted } from "@/server/jobs/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const displayName = validateProjectDisplayName(
      String(formData.get("petName") ?? "")
    );
    const isPublic = formData.get("isPublic") === "on";
    const photos = formData
      .getAll("photos")
      .filter((value): value is File => value instanceof File);
    const uploadDescriptors: ProjectUploadDescriptor[] = photos.map((photo) => ({
      fileName: photo.name,
      contentType: photo.type,
      size: photo.size
    }));

    validateProjectUploadDescriptors(uploadDescriptors);

    const files: ProjectUploadFile[] = await Promise.all(
      photos.map(async (photo) => ({
        fileName: photo.name,
        contentType: photo.type,
        size: photo.size,
        body: Buffer.from(await photo.arrayBuffer())
      }))
    );
    const result = await createProjectFromUploads(files, {
      settings: {
        displayName,
        isPublic
      }
    });
    ensureGenerationWorkerStarted();
    const status = getPublicProjectStatus(result.project.id);

    return NextResponse.json(
      {
        project: result.project,
        uploadedImages: result.uploadedImages,
        warning: result.warning,
        status,
        nextUrl: status?.nextRoute ?? `/projects/${result.project.id}/loading`
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ProjectUploadValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("Project upload failed", error);
    return NextResponse.json(
      { error: "The photos could not be prepared. Please try again." },
      { status: 500 }
    );
  }
}
