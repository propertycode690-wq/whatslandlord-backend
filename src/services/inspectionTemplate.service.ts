import prisma from '../config/database';

export class InspectionTemplateService {
  async getAllTemplates(companyId?: string) {
    return prisma.inspectionTemplate.findMany({
      where: companyId ? { companyId } : {},
      include: {
        rooms: {
          include: {
            items: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplateById(id: string, companyId?: string) {
    return prisma.inspectionTemplate.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        rooms: {
          include: {
            items: {
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async createTemplate(data: any) {
    return prisma.$transaction(
      async (tx) => {
        const template = await tx.inspectionTemplate.create({
          data: {
            name: data.name,
            type: data.type || 'MOVE_IN',
            description: data.description,
            active: data.active !== undefined ? data.active : true,
            createdBy: data.createdBy || 'System',
            companyId: data.companyId,
            rooms:
              data.rooms && Array.isArray(data.rooms) && data.rooms.length > 0
                ? {
                    create: data.rooms.map((roomData: any, rIndex: number) => ({
                      name: roomData.name,
                      sortOrder: roomData.sortOrder !== undefined ? roomData.sortOrder : rIndex,
                      items:
                        roomData.items && Array.isArray(roomData.items) && roomData.items.length > 0
                          ? {
                              create: roomData.items.map((itemData: any, iIndex: number) => ({
                                label: itemData.label,
                                required: itemData.required !== undefined ? itemData.required : false,
                                sortOrder: itemData.sortOrder !== undefined ? itemData.sortOrder : iIndex,
                              })),
                            }
                          : undefined,
                    })),
                  }
                : undefined,
          },
          include: {
            rooms: {
              include: {
                items: true,
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'Inspection Template Created',
            module: 'Leasing',
            object: `Template ${template.id}`,
            ip: '127.0.0.1',
            status: 'Success',
          },
        });

        return template;
      },
      { maxWait: 10000, timeout: 30000 }
    );
  }

  async updateTemplate(id: string, data: any, companyId?: string) {
    const templateExists = await prisma.inspectionTemplate.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
    });
    if (!templateExists) throw new Error('Template not found');

    return prisma.$transaction(
      async (tx) => {
        if (data.rooms && Array.isArray(data.rooms)) {
          const existingRooms = await tx.inspectionTemplateRoom.findMany({
            where: { templateId: id },
            select: { id: true },
          });
          const roomIds = existingRooms.map((r) => r.id);
          if (roomIds.length > 0) {
            await tx.inspectionTemplateItem.deleteMany({
              where: { roomId: { in: roomIds } },
            });
          }
          await tx.inspectionTemplateRoom.deleteMany({
            where: { templateId: id },
          });
        }

        const template = await tx.inspectionTemplate.update({
          where: { id },
          data: {
            name: data.name,
            type: data.type,
            description: data.description,
            active: data.active !== undefined ? data.active : undefined,
            rooms:
              data.rooms && Array.isArray(data.rooms) && data.rooms.length > 0
                ? {
                    create: data.rooms.map((roomData: any, rIndex: number) => ({
                      name: roomData.name,
                      sortOrder: roomData.sortOrder !== undefined ? roomData.sortOrder : rIndex,
                      items:
                        roomData.items && Array.isArray(roomData.items) && roomData.items.length > 0
                          ? {
                              create: roomData.items.map((itemData: any, iIndex: number) => ({
                                label: itemData.label,
                                required: itemData.required !== undefined ? itemData.required : false,
                                sortOrder: itemData.sortOrder !== undefined ? itemData.sortOrder : iIndex,
                              })),
                            }
                          : undefined,
                    })),
                  }
                : undefined,
          },
          include: {
            rooms: {
              include: {
                items: true,
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'Inspection Template Updated',
            module: 'Leasing',
            object: `Template ${id}`,
            ip: '127.0.0.1',
            status: 'Success',
          },
        });

        return template;
      },
      { maxWait: 10000, timeout: 30000 }
    );
  }

  async duplicateTemplate(id: string, companyId?: string) {
    const original = await prisma.inspectionTemplate.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
      include: {
        rooms: {
          include: {
            items: true,
          },
        },
      },
    });
    if (!original) throw new Error('Template not found');

    return this.createTemplate({
      name: `${original.name} (Copy)`,
      type: original.type,
      description: original.description,
      active: original.active,
      createdBy: original.createdBy,
      companyId: original.companyId,
      rooms: original.rooms.map((room) => ({
        name: room.name,
        sortOrder: room.sortOrder,
        items: room.items.map((item) => ({
          label: item.label,
          required: item.required,
          sortOrder: item.sortOrder,
        })),
      })),
    });
  }

  async duplicateRoom(roomId: string, companyId?: string) {
    const originalRoom = await prisma.inspectionTemplateRoom.findFirst({
      where: { id: roomId },
      include: {
        items: true,
        template: true,
      },
    });
    if (!originalRoom) throw new Error('Room not found');
    if (companyId && originalRoom.template.companyId !== companyId) throw new Error('Unauthorized');

    return prisma.$transaction(
      async (tx) => {
        const room = await tx.inspectionTemplateRoom.create({
          data: {
            templateId: originalRoom.templateId,
            name: `${originalRoom.name} (Copy)`,
            sortOrder: originalRoom.sortOrder + 1,
            items:
              originalRoom.items && originalRoom.items.length > 0
                ? {
                    create: originalRoom.items.map((item) => ({
                      label: item.label,
                      required: item.required,
                      sortOrder: item.sortOrder,
                    })),
                  }
                : undefined,
          },
          include: {
            items: true,
          },
        });

        return room;
      }
    );
  }

  async deleteTemplate(id: string, companyId?: string) {
    const templateExists = await prisma.inspectionTemplate.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
    });
    if (!templateExists) throw new Error('Template not found');

    return prisma.$transaction(async (tx) => {
      const rooms = await tx.inspectionTemplateRoom.findMany({
        where: { templateId: id },
        select: { id: true },
      });
      const roomIds = rooms.map((r) => r.id);
      if (roomIds.length > 0) {
        await tx.inspectionTemplateItem.deleteMany({
          where: { roomId: { in: roomIds } },
        });
      }
      await tx.inspectionTemplateRoom.deleteMany({
        where: { templateId: id },
      });
      await tx.inspectionTemplate.delete({
        where: { id },
      });
      return { success: true, message: 'Template deleted successfully' };
    });
  }
}

export const inspectionTemplateService = new InspectionTemplateService();
