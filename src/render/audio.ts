export class EngineAudio {
  private context:AudioContext|null=null;private oscillator:OscillatorNode|null=null;private harmonic:OscillatorNode|null=null;private gain:GainNode|null=null;
  volume=.35;
  async start(){
    if(!this.context){const ctx=this.context=new AudioContext();this.gain=ctx.createGain();this.gain.gain.value=0;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=440;filter.connect(this.gain);this.gain.connect(ctx.destination);
      this.oscillator=ctx.createOscillator();this.oscillator.type='sawtooth';this.oscillator.connect(filter);this.oscillator.start();
      this.harmonic=ctx.createOscillator();this.harmonic.type='triangle';this.harmonic.connect(filter);this.harmonic.start();}
    await this.context.resume();
  }
  update(rpm:number,throttle:number,engine:boolean,paused:boolean){if(!this.context||!this.gain||!this.oscillator||!this.harmonic)return;
    const time=this.context.currentTime;this.oscillator.frequency.setTargetAtTime(Math.max(20,rpm/30),time,.08);this.harmonic.frequency.setTargetAtTime(Math.max(15,rpm/60),time,.1);this.gain.gain.setTargetAtTime(engine&&!paused?this.volume*(.025+throttle*.03):0,time,.07);}
  beep(){if(!this.context)return;const ctx=this.context,o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=880;g.gain.value=this.volume*.25;o.connect(g);g.connect(ctx.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.6);o.stop(ctx.currentTime+.65);}
}
