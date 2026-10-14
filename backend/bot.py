import os

from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import WorkerRunner
from pipecat.pipeline.task import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.groq.llm import GroqLLMService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

load_dotenv(override=True)

SYSTEM_PROMPT = """You are a friendly real-time voice AI assistant. Speak naturally and concisely,
like a person in a conversation. Keep most replies to 1-3 sentences. Avoid markdown,
bullets, emojis, and formatting that sounds unnatural when spoken. Let the user finish
speaking before responding. If you do not understand, ask them to repeat themselves."""


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing {name}. Add it to backend/.env")
    return value


async def run_bot(webrtc_connection):
    """Create one Pipecat pipeline for one browser WebRTC session."""
    deepgram = DeepgramSTTService(api_key=require_env("DEEPGRAM_API_KEY"))

    groq = GroqLLMService(
    api_key=os.getenv("GROQ_API_KEY"),
    model="openai/gpt-oss-20b",
)

    cartesia = CartesiaTTSService(
        api_key=require_env("CARTESIA_API_KEY"),
        settings=CartesiaTTSService.Settings(
            voice=os.getenv("CARTESIA_VOICE_ID", "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"),
        ),
    )

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    context = LLMContext(
        messages=[{"role": "system", "content": SYSTEM_PROMPT}]
    )
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context)

    pipeline = Pipeline(
        [
            transport.input(),
            deepgram,
            user_aggregator,
            groq,
            cartesia,
            transport.output(),
            assistant_aggregator,
        ]
    )
    task = PipelineWorker(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport, _client):
        logger.info("Browser connected; starting voice conversation")
        context.add_message(
            {"role": "system", "content": "Greet the user briefly and invite them to talk."}
        )
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport, _client):
        logger.info("Browser disconnected")
        await task.cancel()

    await WorkerRunner(handle_sigint=False).run(task)
