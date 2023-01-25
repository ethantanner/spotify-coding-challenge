import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from "typeorm";
import { Artist } from "./Artist.model";

@Entity()
export class Track {
  @PrimaryGeneratedColumn ()
  id?: number;

  @Column({
    type: 'varchar',
    length: 12
  })
  isrc: string;

  @Column('text')
  SpotifyImageUri: string;

  @Column('text')
  Title: string;

  @ManyToMany(() => Artist)
  @JoinTable()
  ArtistNameList: Array<Artist>;

  constructor(isrc: string, SpotifyImageUri: string, Title: string, ArtistNameList: Array<Artist>) {
    this.isrc = isrc;
    this.SpotifyImageUri = SpotifyImageUri;
    this.Title = Title;
    this.ArtistNameList = ArtistNameList;
  }
}