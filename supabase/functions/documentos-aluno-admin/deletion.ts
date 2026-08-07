interface DeleteDocumentFileInput {
  admin: any;
  exclusaoId: string;
}

export const deleteDocumentFile = async ({
  admin,
  exclusaoId,
}: DeleteDocumentFileInput) => {
  const { data: exclusao, error: exclusionError } = await admin
    .from("documentos_aluno_exclusoes")
    .select("id, arquivo_id, aluno_id, status")
    .eq("id", exclusaoId)
    .maybeSingle();
  if (exclusionError) throw exclusionError;
  if (!exclusao) throw new Error("Solicitação de exclusão não encontrada.");
  if (exclusao.status === "concluida") {
    return { alreadyCompleted: true, alunoId: exclusao.aluno_id };
  }
  if (exclusao.status === "cancelada") {
    throw new Error("A solicitação de exclusão foi cancelada.");
  }

  const { data: arquivo, error: fileError } = await admin
    .from("documentos_aluno_arquivos")
    .select("id, bucket, path, status")
    .eq("id", exclusao.arquivo_id)
    .maybeSingle();
  if (fileError) throw fileError;
  if (!arquivo) throw new Error("Arquivo da solicitação não encontrado.");

  const { data: claimed, error: claimError } = await admin.rpc(
    "reivindicar_exclusao_arquivo_documento_aluno",
    {
      p_exclusao_id: exclusao.id,
      p_lease_minutos: 10,
    },
  );
  if (claimError) throw claimError;
  if (!claimed) throw new Error("A solicitação já está sendo processada.");

  try {
    const { error: storageError } = await admin.storage
      .from(arquivo.bucket)
      .remove([arquivo.path]);
    if (storageError) throw storageError;

    const { error: finalizeError } = await admin.rpc(
      "finalizar_exclusao_arquivo_documento_aluno",
      {
        p_exclusao_id: exclusao.id,
        p_sucesso: true,
        p_erro: null,
      },
    );
    if (finalizeError) throw finalizeError;

    return { alreadyCompleted: false, alunoId: exclusao.aluno_id };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Falha desconhecida ao excluir arquivo.";
    await admin.rpc("finalizar_exclusao_arquivo_documento_aluno", {
      p_exclusao_id: exclusao.id,
      p_sucesso: false,
      p_erro: message,
    });
    throw error;
  }
};
