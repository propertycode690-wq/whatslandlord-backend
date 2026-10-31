import prisma from '../config/database';
import { InspectionStatus, MoveInStatus, InspectionCondition } from '@prisma/client';
import { getValidUserId } from '../utils/auditHelper';
import cloudinary from '../config/cloudinary';

export class InspectionService {
  async getInspectionById(id: string, companyId?: string) {
    return prisma.inspection.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        moveIn: {
          include: {
            lease: {
              include: {
                tenant: true,
              },
            },
            unit: {
              include: {
                property: true,
              },
            },
          },
        },
        moveOut: {
          include: {
            lease: {
              include: {
                tenant: true,
              },
            },
            unit: {
              include: {
                property: true,
              },
            },
          },
        },
        rooms: {
          include: {
            items: {
              include: {
                photos: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        assignedInspector: true,
      },
    });
  }

  async startInspection(data: { moveInId: string; templateId: string; createdBy?: string; userId?: string; companyId?: string }) {
    const moveIn = await prisma.moveIn.findFirst({
      where: { id: data.moveInId, ...(data.companyId ? { companyId: data.companyId } : {}) },
      include: { lease: true },
    });
    if (!moveIn) throw new Error('Move In record not found');
    if (moveIn.status === 'COMPLETED') throw new Error('Move In is already completed');

    // Return existing inspection if already started for this Move-In
    const existingInspection = await prisma.inspection.findFirst({
      where: { moveInId: data.moveInId },
    });
    if (existingInspection) {
      return existingInspection;
    }

    const template = await prisma.inspectionTemplate.findFirst({
      where: { id: data.templateId, ...(data.companyId ? { companyId: data.companyId } : {}) },
      include: {
        rooms: {
          include: { items: true },
        },
      },
    });
    if (!template) throw new Error('Inspection template not found');
    if (!template.active) throw new Error('Inspection template is inactive');

    // Generate guaranteed unique inspection number (e.g. MI-8392019)
    const prefix = template.type === 'MOVE_OUT' ? 'MO' : 'MI';
    const timestampSuffix = String(Date.now()).slice(-6);
    const randomSuffix = String(Math.floor(100 + Math.random() * 900));
    const inspectionNumber = `${prefix}-${timestampSuffix}${randomSuffix}`;

    return prisma.$transaction(
      async (tx) => {
        // 1. Update MoveIn status
        await tx.moveIn.update({
          where: { id: data.moveInId },
          data: { status: 'INSPECTION_IN_PROGRESS' },
        });

        // 2. Create Inspection with nested rooms and items
        const inspection = await tx.inspection.create({
          data: {
            inspectionNumber,
            type: template.type === 'MOVE_OUT' ? 'MOVE_OUT' : 'MOVE_IN',
            moveInId: data.moveInId,
            templateId: data.templateId,
            templateName: template.name,
            templateVersion: 1, // Default snapshot version
            status: 'DRAFT',
            createdBy: data.createdBy || 'System',
            companyId: data.companyId,
            startedAt: new Date(),
            rooms:
              template.rooms && template.rooms.length > 0
                ? {
                    create: template.rooms.map((roomTemp: any) => ({
                      name: roomTemp.name,
                      sortOrder: roomTemp.sortOrder,
                      items:
                        roomTemp.items && roomTemp.items.length > 0
                          ? {
                              create: roomTemp.items.map((itemTemp: any) => ({
                                label: itemTemp.label,
                                required: itemTemp.required,
                                sortOrder: itemTemp.sortOrder,
                                completed: false,
                              })),
                            }
                          : undefined,
                    })),
                  }
                : undefined,
          },
        });

        const validUserId = await getValidUserId(data.userId, tx);
        await tx.auditLog.create({
          data: {
            action: `Inspection ${inspectionNumber} Started`,
            userId: validUserId,
            module: 'Leasing',
            object: `Inspection ${inspection.id}`,
            ip: '127.0.0.1',
            status: 'Success',
          },
        });

        return inspection;
      },
      { maxWait: 10000, timeout: 30000 }
    );
  }

  async updateInspectionDraft(id: string, data: any, companyId?: string) {
    const inspection = await prisma.inspection.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
      include: {
        moveIn: true,
        moveOut: true,
      },
    });
    if (!inspection) throw new Error('Inspection not found');
    if (inspection.status === 'COMPLETED') throw new Error('Cannot edit a completed inspection');

    // Determine Cloudinary folder based on inspection type:
    // 'move_out' for Move-Out workflow, 'move_in' for Move-In workflow
    const isMoveOut = inspection.type === 'MOVE_OUT' || Boolean(inspection.moveOutId);
    const targetFolder = isMoveOut ? 'move_out' : 'move_in';

    // Pre-upload any base64 photos to Cloudinary before starting the database transaction
    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.photos && Array.isArray(item.photos)) {
          for (let pIndex = 0; pIndex < item.photos.length; pIndex++) {
            const photo = item.photos[pIndex];
            if (photo && photo.url && typeof photo.url === 'string') {
              // Check if photo is a base64 Data URI
              if (photo.url.startsWith('data:image/') || photo.url.startsWith('data:application/')) {
                try {
                  const uploadRes = await cloudinary.uploader.upload(photo.url, {
                    folder: targetFolder,
                    resource_type: 'auto',
                  });
                  if (uploadRes && uploadRes.secure_url) {
                    photo.url = uploadRes.secure_url;
                  }
                } catch (err: any) {
                  console.error(`[Cloudinary] Failed to upload ${targetFolder} photo:`, err?.message || err);
                  throw new Error(`Cloudinary upload failed for ${targetFolder}: ${err?.message || 'Upload error'}`);
                }
              }
            }
          }
        }
      }
    }

    return prisma.$transaction(
      async (tx) => {
        // Update basic fields
        const updateData: any = {};
      if (data.overallNotes !== undefined) updateData.overallNotes = data.overallNotes;
      if (data.managerNotes !== undefined) updateData.managerNotes = data.managerNotes;
      if (data.assignedInspectorId !== undefined) {
        updateData.assignedInspectorId = data.assignedInspectorId || null;
        if (data.assignedInspectorId && data.assignedInspectorId !== inspection.assignedInspectorId) {
          updateData.assignedBy = data.userId || 'User';
          updateData.assignedAt = new Date();
        } else if (!data.assignedInspectorId) {
          updateData.assignedBy = null;
          updateData.assignedAt = null;
        }
      }
      if (data.tenantSignature !== undefined) {
        updateData.tenantSignature = data.tenantSignature;
        updateData.tenantSignedAt = data.tenantSignature ? new Date() : null;
      }
      if (data.inspectorSignature !== undefined) {
        updateData.inspectorSignature = data.inspectorSignature;
        updateData.inspectorSignedAt = data.inspectorSignature ? new Date() : null;
      }
      if (data.status) updateData.status = data.status;

      let templateChanged = false;
      if (data.templateId && data.templateId !== inspection.templateId) {
        const template = await tx.inspectionTemplate.findFirst({
          where: { id: data.templateId, ...(companyId ? { companyId } : {}) },
          include: {
            rooms: {
              include: { items: true },
            },
          },
        });
        if (template) {
          updateData.templateId = template.id;
          updateData.templateName = template.name;
          templateChanged = true;
          
          // Clean existing checklist rooms & items (database cascade handles items)
          await tx.inspectionRoom.deleteMany({ where: { inspectionId: id } });

          // Populate new rooms & items from selected template
          if (template.rooms && template.rooms.length > 0) {
            for (const roomTemp of template.rooms) {
              await tx.inspectionRoom.create({
                data: {
                  inspectionId: id,
                  name: roomTemp.name,
                  sortOrder: roomTemp.sortOrder,
                  items: roomTemp.items && roomTemp.items.length > 0
                    ? {
                        create: roomTemp.items.map((itemTemp: any) => ({
                          label: itemTemp.label,
                          required: itemTemp.required,
                          sortOrder: itemTemp.sortOrder,
                          completed: false,
                        })),
                      }
                    : undefined,
                },
              });
            }
          }
        }
      }

      await tx.inspection.update({
        where: { id },
        data: updateData,
      });

      // Update room items
      if (data.items && Array.isArray(data.items) && !templateChanged) {
        for (const item of data.items) {
          const itemUpdateData: any = {};
          if (item.condition !== undefined) itemUpdateData.condition = item.condition;
          if (item.notes !== undefined) itemUpdateData.notes = item.notes;
          if (item.completed !== undefined) itemUpdateData.completed = item.completed;

          const updatedItem = await tx.inspectionItem.update({
            where: { id: item.id },
            data: itemUpdateData,
          });

          // Handle Photos if provided
          if (item.photos && Array.isArray(item.photos)) {
            // Delete existing photos for this item to sync
            await tx.inspectionPhoto.deleteMany({ where: { itemId: item.id } });
            for (let pIndex = 0; pIndex < item.photos.length; pIndex++) {
              const photo = item.photos[pIndex];
              await tx.inspectionPhoto.create({
                data: {
                  itemId: updatedItem.id,
                  url: photo.url,
                  caption: photo.caption || '',
                  sortOrder: photo.sortOrder !== undefined ? photo.sortOrder : pIndex,
                  uploadedBy: data.userId || 'User',
                },
              });
            }
          }
        }
      }

      return tx.inspection.findUnique({
        where: { id },
        include: {
          assignedInspector: true,
          rooms: {
            include: {
              items: {
                include: { photos: true },
              },
            },
          },
        },
      });
    }, {
      maxWait: 10000,
      timeout: 30000
    });
  }

  async completeInspection(id: string, userId?: string, companyId?: string) {
    const inspection = await prisma.inspection.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
      include: {
        rooms: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!inspection) throw new Error('Inspection not found');
    if (inspection.status === 'COMPLETED') {
      if (inspection.moveInId) {
        await prisma.moveIn.update({
          where: { id: inspection.moveInId },
          data: { status: 'INSPECTION_COMPLETED' },
        });
      }
      if (inspection.moveOutId) {
        await prisma.moveOut.update({
          where: { id: inspection.moveOutId },
          data: { status: 'INSPECTION_COMPLETED' },
        });
      }
      return inspection;
    }

    // Validation checks:
    // 1. Required items must be completed & have a condition selected
    for (const room of inspection.rooms) {
      for (const item of room.items) {
        if (item.required) {
          if (!item.completed || !item.condition) {
            throw new Error(`Required item "${item.label}" in room "${room.name}" is incomplete or missing a condition rating.`);
          }
        }
      }
    }

    // 2. Signatures must be present
    if (!inspection.inspectorSignature) {
      throw new Error('Inspector signature is required to complete the inspection.');
    }
    if (!inspection.tenantSignature) {
      throw new Error('Tenant signature is required to complete the inspection.');
    }

    return prisma.$transaction(async (tx) => {
      const completed = await tx.inspection.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      if (inspection.moveInId) {
        await tx.moveIn.update({
          where: { id: inspection.moveInId },
          data: {
            status: 'INSPECTION_COMPLETED',
          },
        });
      }

      if (inspection.moveOutId) {
        await tx.moveOut.update({
          where: { id: inspection.moveOutId },
          data: {
            status: 'INSPECTION_COMPLETED',
          },
        });
      }

      const validUserId = await getValidUserId(userId, tx);
      await tx.auditLog.create({
        data: {
          action: `Inspection ${inspection.inspectionNumber} Completed`,
          userId: validUserId,
          module: 'Leasing',
          object: `Inspection ${id}`,
          ip: '127.0.0.1',
          status: 'Success',
        },
      });

      return completed;
    });
  }

  async reopenInspection(id: string, userId?: string, companyId?: string) {
    const inspection = await prisma.inspection.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
    });
    if (!inspection) throw new Error('Inspection not found');

    return prisma.$transaction(async (tx) => {
      const reopened = await tx.inspection.update({
        where: { id },
        data: {
          status: 'DRAFT',
          completedAt: null,
        },
      });

      if (inspection.moveInId) {
        await tx.moveIn.update({
          where: { id: inspection.moveInId },
          data: {
            status: 'INSPECTION_IN_PROGRESS',
          },
        });
      }

      const validUserId = await getValidUserId(userId, tx);
      await tx.auditLog.create({
        data: {
          action: `Inspection ${inspection.inspectionNumber} Reopened`,
          userId: validUserId,
          module: 'Leasing',
          object: `Inspection ${id}`,
          ip: '127.0.0.1',
          status: 'Success',
        },
      });

    });
  }

  async getInspectors(companyId?: string) {
    return prisma.user.findMany({
      where: companyId ? { companyId } : {},
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });
  }

  async uploadItemPhoto(itemId: string, file: Express.Multer.File, userId?: string) {
    const item = await prisma.inspectionItem.findUnique({
      where: { id: itemId },
      include: {
        room: {
          include: {
            inspection: true,
          },
        },
        photos: true,
      },
    });
    if (!item) throw new Error('Inspection item not found');

    const inspection = item.room.inspection;
    const isMoveOut = inspection.type === 'MOVE_OUT' || Boolean(inspection.moveOutId);
    const targetFolder = isMoveOut ? 'move_out' : 'move_in';

    const uploadRes = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: targetFolder, resource_type: 'auto' },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      uploadStream.end(file.buffer);
    });

    const photoUrl = uploadRes?.secure_url;
    if (!photoUrl) throw new Error('Failed to obtain secure URL from Cloudinary');

    const newPhoto = await prisma.inspectionPhoto.create({
      data: {
        itemId,
        url: photoUrl,
        caption: file.originalname || 'photo.jpg',
        sortOrder: item.photos.length,
        uploadedBy: userId || 'User',
      },
    });

    return newPhoto;
  }
}

export const inspectionService = new InspectionService();
