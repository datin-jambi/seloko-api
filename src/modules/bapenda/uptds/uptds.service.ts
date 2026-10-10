import { prisma } from "~/config/database.js";
import { NotFoundError, ConflictError } from "~/common/errors/index.js";
import type { Prisma } from "@prisma/client";
import type {
  ListUptdsQuery,
  PublicListUptdsQuery,
  CreateUptdBody,
  UpdateUptdBody,
} from "./uptds.schema.js";

export async function listUptds(query: ListUptdsQuery) {
  const { page, limit, search, city, isActive, showOnPublicMap, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.BapendaUptdWhereInput = {
    deletedAt: null,
  };

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (showOnPublicMap !== undefined) {
    where.showOnPublicMap = showOnPublicMap;
  }

  if (city) {
    where.city = { contains: city, mode: "insensitive" };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { headName: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
    ];
  }

  const [totalItems, data] = await Promise.all([
    prisma.bapendaUptd.count({ where }),
    prisma.bapendaUptd.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
  ]);

  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    data,
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function getPublicUptds(query: PublicListUptdsQuery) {
  const { search, city } = query;

  const where: Prisma.BapendaUptdWhereInput = {
    deletedAt: null,
    isActive: true,
  };

  if (city) {
    where.city = { contains: city, mode: "insensitive" };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
    ];
  }

  const data = await prisma.bapendaUptd.findMany({
    where,
    orderBy: [{ city: "asc" }, { name: "asc" }],
  });

  return data;
}

export async function getUptdById(id: string) {
  const uptd = await prisma.bapendaUptd.findFirst({
    where: { id, deletedAt: null },
  });

  if (!uptd) {
    throw new NotFoundError("UPTD Samsat", id);
  }

  return uptd;
}

export async function getUptdByCode(code: string) {
  const uptd = await prisma.bapendaUptd.findFirst({
    where: { code, deletedAt: null },
  });

  if (!uptd) {
    throw new NotFoundError(`UPTD Samsat dengan kode '${code}'`);
  }

  return uptd;
}

export async function createUptd(data: CreateUptdBody) {
  const existing = await prisma.bapendaUptd.findFirst({
    where: { code: data.code },
  });

  const createPayload: Prisma.BapendaUptdCreateInput = {
    code: data.code,
    name: data.name,
    description: data.description ?? null,
    address: data.address ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    headName: data.headName ?? null,
    province: data.province ?? "Jambi",
    city: data.city ?? null,
    district: data.district ?? null,
    subDistrict: data.subDistrict ?? null,
    postalCode: data.postalCode ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    googleMapsUrl: data.googleMapsUrl ?? null,
    isActive: data.isActive ?? true,
    showOnPublicMap: data.showOnPublicMap ?? false,
  };

  if (existing) {
    if (existing.deletedAt) {
      return prisma.bapendaUptd.update({
        where: { id: existing.id },
        data: {
          ...createPayload,
          deletedAt: null,
          updatedAt: new Date(),
        },
      });
    }
    throw new ConflictError(`Kode UPTD '${data.code}' sudah digunakan`);
  }

  return prisma.bapendaUptd.create({
    data: createPayload,
  });
}

export async function updateUptd(id: string, data: UpdateUptdBody) {
  const existing = await getUptdById(id);

  if (data.code && data.code !== existing.code) {
    const codeConflict = await prisma.bapendaUptd.findFirst({
      where: { code: data.code, id: { not: id }, deletedAt: null },
    });
    if (codeConflict) {
      throw new ConflictError(`Kode UPTD '${data.code}' sudah digunakan`);
    }
  }

  const updatePayload: Prisma.BapendaUptdUpdateInput = {};
  if (data.code !== undefined) updatePayload.code = data.code;
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.description !== undefined) updatePayload.description = data.description ?? null;
  if (data.address !== undefined) updatePayload.address = data.address ?? null;
  if (data.phone !== undefined) updatePayload.phone = data.phone ?? null;
  if (data.email !== undefined) updatePayload.email = data.email ?? null;
  if (data.headName !== undefined) updatePayload.headName = data.headName ?? null;
  if (data.province !== undefined) updatePayload.province = data.province ?? "Jambi";
  if (data.city !== undefined) updatePayload.city = data.city ?? null;
  if (data.district !== undefined) updatePayload.district = data.district ?? null;
  if (data.subDistrict !== undefined) updatePayload.subDistrict = data.subDistrict ?? null;
  if (data.postalCode !== undefined) updatePayload.postalCode = data.postalCode ?? null;
  if (data.latitude !== undefined) updatePayload.latitude = data.latitude ?? null;
  if (data.longitude !== undefined) updatePayload.longitude = data.longitude ?? null;
  if (data.googleMapsUrl !== undefined) updatePayload.googleMapsUrl = data.googleMapsUrl ?? null;
  if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
  if (data.showOnPublicMap !== undefined) updatePayload.showOnPublicMap = data.showOnPublicMap;

  return prisma.bapendaUptd.update({
    where: { id },
    data: updatePayload,
  });
}

export async function setUptdActive(id: string, isActive: boolean) {
  await getUptdById(id);

  return prisma.bapendaUptd.update({
    where: { id },
    data: { isActive },
  });
}

export async function setUptdPublicMap(id: string, showOnPublicMap: boolean) {
  await getUptdById(id);

  return prisma.bapendaUptd.update({
    where: { id },
    data: { showOnPublicMap },
  });
}

export async function deleteUptd(id: string) {
  await getUptdById(id);

  await prisma.bapendaUptd.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      showOnPublicMap: false,
    },
  });

  return { id, deleted: true };
}
