import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updatePassword() {
  const email = 'admin@example.com';
  const newPassword = 'admin123'; // Senha que você quer usar

  try {
    // Gerar hash da nova senha
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Atualizar usuário
    const user = await prisma.user.update({
      where: { email },
      data: { passwordHash },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    console.log('✅ Senha atualizada com sucesso!');
    console.log('Usuário:', user);
    console.log('Nova senha:', newPassword);
  } catch (error: any) {
    console.error('❌ Erro ao atualizar senha:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updatePassword();
