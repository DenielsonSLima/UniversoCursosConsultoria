import type { CanonicalPdfImage } from '../../secretaria/shared/canonical-document-vector-pdf';

/**
 * Cópia compacta e transparente da marca Universo usada somente quando não
 * existe marca d'água configurada e o asset público não pôde ser resolvido.
 * É um recurso isolado: nunca contém texto, tabelas ou a página do relatório.
 */
const FALLBACK_WATERMARK_BASE64 = [
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAAAjCAYAAABfLc7mAAALGElEQVR42u2be7BVZRnGf2vtfQ7ncFMOIkQIokMISBRIXBIvmBo4',
  'QYWjQlOTDeZkYzcZRRuxmpIumqY1KBiFdtEycryQpZYlpXgILwR4CZDLGT1yCUE8Hs5ea/XHfr7m7XOtffbeHZTTYc2s2Xuvy3d5',
  'L8/7vO/37YCB4+hER6DPBDgRmAtMBYYANUAT8GfgNuAJIARiuvARdCIFBzpj4KvAfKBnxrMHgO8CVwN5cz3uagrP0Wtg5xlrUTk/',
  'Bi4DaoHIKN55diylngocCfzOKDbpah7cWRSckzLnAVfIQ0Odgeflob5HwGR9HwC8H+gHbPbeOQzR7zAsh/K8dwPPy3PDMpWUeM99',
  'A7hGHl7oCgrOH8JjcwQp0u/PAvVSTFCBgThFtgCLTCzmsILfOa9NgKOBX4gdx8D7dD1XJcQ/Arxi4L7LKDhMuR5neFTWc+W2EaR4',
  'X5xyLw/s0L2TOwAJApGznM5yyVap+WWFhKSM8WTJK64gbKXJ8S39H8wYHHQAaz0N+KNgNl8FOYoljG3AMKD1bWT7SYaDxGWmglmG',
  'GpVJSP/jKSd4UF0AXvA6yQPvMYQnAN4ANun+YKC3ubcX2GqU7D4HAg3mWhvwovrqB/Q39wLg78DTYsBRFfDsFHyH2h1TATwnkkMb',
  'cLzif6njDRVaWlMM3BZcjgPG6bNe720BnlJ/SUqBxv7up/dPUBoYAduBtZJXZJ8PGDjuZaUR7mjWhPabB98FbNSAnAIeN2nIcuBj',
  'RqB7gIlivQ6SCsAtwMXGI5uA4errarHcxAjoFOAY4OfmnUoO19bxMqzVFbzbqveagEbgpHaePyBBLwe+pjlZjxwJXAucDdSlvN8m',
  'nnCljNrJ3nnkMSrwzAKOyhjD08D3ZdCBbxlxOxASm/zSf86+G8mylmlwNra2lOgrMe276z2B3wC7K4ydmCLIKuW+PSpk0EmJuaf1',
  'VSuvnAfcLyU65Y4F/grM1HV/DAWRyQ8Df5GHxroWqWjTKOc4SsYQecbliOjtwBLn+eFBikEFYIIs2UJrW4Vt1cmTfllm/ElTkLPm',
  'XIZi2jRed7aZz1Jtt+mMTduxhH0acIG5d7OMvtUg4Erg1xRr5i4vbwF6AT80njsMuFfhyym2Ru1sBXaZ2oCbz1xgARAdDAVbJV8F',
  'fBB4s8p2YgljkQZerhcnEtprwG/1O/IUC/B5YLQsf7TO9+pzLPBqhgc3CnJHA6MEnQUvXk7U72OB8SbFC4DPAFOA84BJwBc1Xhfn',
  'P6DwEAtye2v+ebWxjOJiyyiFuE+L9wTGMK4EhuffhirUTwQ5+w1EV6LgBFgHPARMLzMWR3rmAeDlFMh1x7PiCZUe+4F/mt/XAufL',
  'ONoM50AemfdC1WTgbyJXrcBNhmDtl2FulZKnecTzQSnUHa9L4Q7pnDF2A+bmD6JynRcPkxVeVGWRwh03SsFhBhQHKSnJz0rkosjK',
  'N6UgQwD8wFNiqWOiMolE8BkCD+veFnGIPub5i6Sk52Vkq6W4DV67Jxs5ujHfoPHlTVUvBO4Cvq5sp6CxTO1oBTshPScy0GBiwhJV',
  'kqqF/D8B64ERXlwPMlKjjWKlaWvC7p2PlOjz7hQFOyGPFRlyPGGMWd2KgaWKm3ngX8BC4DpDqGI9f6LOOXKC9RSXOZdpjMcZuYYK',
  'detNyEm8NHSNFOzmOKSjY7AT5D+AL5u8OQEWiyhQRcGiRoL5kbc0iDyw2VsuRATmgN7t6A0HRyiGTlF8rTXh5FZ5aGJI1vVi17ul',
  '9Foz3lZDvkYCP5VBJIb529StNSXkBKb+YI/u+XYmQpUK6Sd4/CRwlqxtjGIKVUC1S3nuVK7c18Tip6TEGUagBbHnrLQoMfFsizFE',
  '6y1NVZREAT6nusEFXsp3vdj0uUIOV+zolkL+5qtmsN1TZE+x8Z1eISUxhSR7tOQzJh95OWxUQa3ZBfhAlvyMWGBcYgdGOciQkwfc',
  'AXzJ3JuVMoZVgrKsLTuuve+pFNreipYfgjYr5ORktLPllU5esxSXV0qJDfL6euBRioso9bo3XhD9IZPqJHKMJz1mnANOV/Wvm0fo',
  'eouR2yraJld1spbQoMpWpBcjQWu999yejKKAvbZVKUDYATsqnKAXa1ylUGBZmYsESZl9+r83Cka/CVwo+A1MoSdWeojCSqNI132q',
  'yrmizzpB8lnKZwMjp6P13l5vvFcBgxSPXd6bCCH6GmcMgHvzwGPCflfDrAN+BXxHEDFIjVolBQrotLMMmVdlZSbw8SrryT552gCs',
  'ECTb9lye6XJfzJyykGauyqFZRGyJoNoPUbWaW14CvltoUGe8ypGdx1ShatX4TpFs75TyGgTnfYxsHUlsU/awwOxiGaIy8SLJokEI',
  'coa3+rUTWJxXOvApeair3pwkkuIL2FVRWmR5gSETkTlznlIuEeXvayh8kgJ/kYm3aR4WGK+Y4Qne9btCk/PXfRPjXQ4K57RjVA+a',
  'WBx5Z8Es8e0Q2RtujGqo3ltKcQ9Zg5Hv5TrfNHXpWPdrpdz7NYdvCQ3OMOMfpOt+udM618VAs/OIOUqYa7w9TXZHRaj7e2RxLxmG',
  '2l2Dqddnb0/Bzaoa5TSAGn3v5cXtnD5r9b0mg2w9IqYeelYbCDGyUCVn+s5VkPb18ObXw2s3EtfISWE5GfRApYbniz/UeIhS58X7',
  'WhnKLOnD1Zk/qiKGlYk1NAyi7JB+lgM5t+B/j7z2EgX7wR4h2qeO/yB2t8mr1qwVc3bMdpu35SYnGLtB1uhiaLMxoM0iR5GBqR0p',
  'nuxY8q1ipYkxpJdEYuyaqnt3l+5FxhiCEiw7FNy70uR+j7n7RnC7SFNsBD5GCn5YrPlSxdshMm53vKaixz2a126DMqH6niOCeaHI',
  '1ADjrftEvFZIP00OwdyCv+8JAwQp9YKRnabkR5UbyoMO2rbq2umjSTUYaPu2qlMdtanOVuTSEKG9XRhp24Nq5AwNpo1mk8vbvD80',
  '79u2emr5sLs8fI+cynKE2Cq43B0DWZMKymSoYcr1pMI27GRvkle4kt1Ylf7CMnZFDFUoeYaDs2HQhajBSpHWVtnWkarePS6v31fi',
  '2Skqe7ak7YtOPBaXtvfnf011kg7eDrRZZCIvASxsB13cvbPFeierLUf+JgmxZgm9hktoLwpuZ2tRoI+eqTUkrK9gtM5405lKX6aI',
  'RR8Qc9+mOD5b+fIGGeeZ8uTxQqWJiuPzFF4eEgFrUUFlr8b7CXn1NHGT09XnK2GGEmIvpzvU/hHgYu5zFP+5YMlVWIZhXComPlOF',
  'jmukoMuk5MulqPkiS1OV8+5V3D9PypxkyNpSGc51ZuHhC8rbZwhZbpMCb9S12VLKHMXWaRS34sxTmPyKYHinSFde8Xmp+MlCvXMF',
  'xa0/o2R847Qws+BQ3hdd7qb2uYLbZ710odSxBjhHcXCXSMwMeW0dxUX4VRR3YYyguHmhIB7SX167Rp6yyOxiaZTg20w/0+Wt3XXt',
  'VfVzhDzydY3/SYo7Nybo2jlq84BZYGnVWHtpLDVS6GqK+7H6qrI2QQrv35n+m0Q7m90KFWwgWClBDNYy2xbB8e/FkHcLlkeKBd8i',
  'gZ6qokOLctH79Bxqc4SU3Gj6GUpx0X8JxT1T0+XlLyiebhcSuVB4lxj1SIr/lHxAxtGkLKFWbPpctblKRrBOMnhCRroJeDToZH8f',
  'LbWxoEv+uYxO/NeVSqA6qjL9wcu7E6/S5VfkAm+jPl4hKPTGk9VPnPK/qcBDmdBbcoy8LMS2Y8f7X2PNd1HDTjxI98umEW/dRRmV',
  'Af9xhf0kJcYXp5Qho4yFkChr3OFhEPv/Pv4NtPWUnLfE5lUAAAAASUVORK5CYII=',
].join('');

export const FINANCIAL_REPORT_FALLBACK_WATERMARK: CanonicalPdfImage = {
  dataUrl: `data:image/png;base64,${FALLBACK_WATERMARK_BASE64}`,
  format: 'PNG',
};
